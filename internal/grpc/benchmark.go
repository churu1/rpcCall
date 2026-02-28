package grpc

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/dynamic"
	"github.com/jhump/protoreflect/dynamic/grpcdynamic"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"rpccall/internal/logger"
	"rpccall/internal/models"
)

func (c *Caller) RunBenchmark(
	ctx context.Context,
	req models.GrpcRequest,
	cfg models.BenchmarkConfig,
	onProgress func(models.BenchmarkProgress),
	onDone func(models.BenchmarkResult),
) error {
	methodDesc, err := c.findMethodDescriptor(req.ServiceName, req.MethodName)
	if err != nil {
		return err
	}

	if cfg.Concurrency < 1 {
		cfg.Concurrency = 1
	}

	conns, err := createConnPool(req, cfg.Concurrency)
	if err != nil {
		return err
	}
	defer func() {
		for _, conn := range conns {
			conn.Close()
		}
	}()

	var (
		totalSent    atomic.Int64
		totalSuccess atomic.Int64
		totalError   atomic.Int64
		latencies    []int64
		latMu        sync.Mutex
		errorCodes   = make(map[string]int64)
		errCodeMu    sync.Mutex
		seqCounter   atomic.Int64
	)

	appendLatency := func(ms int64) {
		latMu.Lock()
		latencies = append(latencies, ms)
		latMu.Unlock()
	}

	recordError := func(code string) {
		errCodeMu.Lock()
		errorCodes[code]++
		errCodeMu.Unlock()
	}

	worker := func(conn *grpc.ClientConn, limiter func() bool) {
		stub := grpcdynamic.NewStub(conn)
		outMD := buildOutgoingMetadata(req.Metadata)

		for limiter() {
			if ctx.Err() != nil {
				return
			}

			body := resolveVariables(req.Body, cfg.Variables, &seqCounter)
			reqMsg := dynamic.NewMessage(methodDesc.GetInputType())
			if err := reqMsg.UnmarshalJSON([]byte(body)); err != nil {
				totalSent.Add(1)
				totalError.Add(1)
				recordError("JSON_ERROR")
				continue
			}

			callCtx := ctx
			if len(outMD) > 0 {
				callCtx = metadata.NewOutgoingContext(ctx, outMD)
			}
			callCtx, cancel := context.WithTimeout(callCtx, 30*time.Second)

			start := time.Now()
			_, rpcErr := stub.InvokeRpc(callCtx, methodDesc, reqMsg)
			elapsed := time.Since(start).Milliseconds()
			cancel()

			totalSent.Add(1)
			appendLatency(elapsed)

			if rpcErr != nil {
				totalError.Add(1)
				st, _ := status.FromError(rpcErr)
				recordError(st.Code().String())
			} else {
				totalSuccess.Add(1)
			}
		}
	}

	benchStart := time.Now()

	var stopOnce sync.Once
	done := make(chan struct{})

	startWorkers := func(n int, limiter func() bool) {
		var wg sync.WaitGroup
		for i := 0; i < n; i++ {
			wg.Add(1)
			conn := conns[i%len(conns)]
			go func() {
				defer wg.Done()
				worker(conn, limiter)
			}()
		}
		go func() {
			wg.Wait()
			stopOnce.Do(func() { close(done) })
		}()
	}

	var limiter func() bool

	if cfg.Mode == "count" {
		var dispatched atomic.Int64
		total := int64(cfg.TotalRequests)
		limiter = func() bool {
			return dispatched.Add(1) <= total && ctx.Err() == nil
		}
	} else {
		deadline := time.After(time.Duration(cfg.DurationSec) * time.Second)
		expired := make(chan struct{})
		go func() {
			select {
			case <-deadline:
				close(expired)
			case <-ctx.Done():
			}
		}()
		limiter = func() bool {
			select {
			case <-expired:
				return false
			default:
				return ctx.Err() == nil
			}
		}
	}

	initialConcurrency := cfg.Concurrency
	if cfg.RampUpEnabled && cfg.RampUpStepAdd > 0 && cfg.RampUpStepSec > 0 {
		initialConcurrency = cfg.RampUpStepAdd
		if initialConcurrency > cfg.Concurrency {
			initialConcurrency = cfg.Concurrency
		}
	}

	startWorkers(initialConcurrency, limiter)

	if cfg.RampUpEnabled && cfg.RampUpStepAdd > 0 && cfg.RampUpStepSec > 0 {
		go func() {
			current := initialConcurrency
			ticker := time.NewTicker(time.Duration(cfg.RampUpStepSec) * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					add := cfg.RampUpStepAdd
					if current+add > cfg.Concurrency {
						add = cfg.Concurrency - current
					}
					if add <= 0 {
						return
					}
					current += add
					logger.Info("ramp-up: adding %d workers (total %d)", add, current)
					startWorkers(add, limiter)
				case <-ctx.Done():
					return
				case <-done:
					return
				}
			}
		}()
	}

	// Progress reporter
	progressTicker := time.NewTicker(500 * time.Millisecond)
	defer progressTicker.Stop()

	go func() {
		for {
			select {
			case <-progressTicker.C:
				p := buildProgress(benchStart, &totalSent, &totalSuccess, &totalError, &latencies, &latMu, errorCodes, &errCodeMu)
				onProgress(p)
			case <-done:
				return
			case <-ctx.Done():
				return
			}
		}
	}()

	select {
	case <-done:
	case <-ctx.Done():
	}

	elapsed := time.Since(benchStart)

	latMu.Lock()
	finalLatencies := make([]int64, len(latencies))
	copy(finalLatencies, latencies)
	latMu.Unlock()

	errCodeMu.Lock()
	finalErrCodes := make(map[string]int64)
	for k, v := range errorCodes {
		finalErrCodes[k] = v
	}
	errCodeMu.Unlock()

	sort.Slice(finalLatencies, func(i, j int) bool { return finalLatencies[i] < finalLatencies[j] })

	result := models.BenchmarkResult{
		BenchmarkProgress: buildProgressFromLatencies(
			elapsed, totalSent.Load(), totalSuccess.Load(), totalError.Load(),
			finalLatencies, finalErrCodes,
		),
		Concurrency:    cfg.Concurrency,
		DurationMs:     elapsed.Milliseconds(),
		LatencyBuckets: buildLatencyBuckets(finalLatencies),
	}

	onDone(result)
	logger.Info("benchmark done: %d sent, %d ok, %d err, %.1f QPS, avg %.1fms",
		result.TotalSent, result.TotalSuccess, result.TotalError, result.CurrentQPS, result.AvgLatencyMs)
	return nil
}

func createConnPool(req models.GrpcRequest, size int) ([]*grpc.ClientConn, error) {
	conns := make([]*grpc.ClientConn, 0, size)
	for i := 0; i < size; i++ {
		conn, err := dialWithConfig(req.Address, req)
		if err != nil {
			for _, c := range conns {
				c.Close()
			}
			return nil, fmt.Errorf("failed to create connection pool: %w", err)
		}
		conns = append(conns, conn)
	}
	return conns, nil
}

func resolveVariables(body string, vars []models.BenchmarkVariable, seq *atomic.Int64) string {
	if len(vars) == 0 {
		return body
	}
	result := body
	for _, v := range vars {
		placeholder := "{{" + v.Name + "}}"
		if !strings.Contains(result, placeholder) {
			continue
		}
		var val string
		switch v.Type {
		case "sequence":
			val = fmt.Sprintf("%d", seq.Add(1)+v.Min-1)
		case "random_int":
			if v.Max <= v.Min {
				val = fmt.Sprintf("%d", v.Min)
			} else {
				val = fmt.Sprintf("%d", v.Min+rand.Int63n(v.Max-v.Min+1))
			}
		case "random_string":
			length := 8
			if v.Max > 0 {
				length = int(v.Max)
			}
			val = randomString(length)
		case "list":
			if len(v.Values) > 0 {
				val = v.Values[rand.Intn(len(v.Values))]
			}
		}
		result = strings.ReplaceAll(result, placeholder, val)
	}
	return result
}

const charset = "abcdefghijklmnopqrstuvwxyz0123456789"

func randomString(length int) string {
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

func buildProgress(
	start time.Time,
	sent, success, errCount *atomic.Int64,
	latencies *[]int64, latMu *sync.Mutex,
	errorCodes map[string]int64, errCodeMu *sync.Mutex,
) models.BenchmarkProgress {
	latMu.Lock()
	snapshot := make([]int64, len(*latencies))
	copy(snapshot, *latencies)
	latMu.Unlock()

	errCodeMu.Lock()
	ecCopy := make(map[string]int64)
	for k, v := range errorCodes {
		ecCopy[k] = v
	}
	errCodeMu.Unlock()

	elapsed := time.Since(start)
	return buildProgressFromLatencies(elapsed, sent.Load(), success.Load(), errCount.Load(), snapshot, ecCopy)
}

func buildProgressFromLatencies(
	elapsed time.Duration,
	sent, success, errCount int64,
	sortedLatencies []int64,
	errorCodes map[string]int64,
) models.BenchmarkProgress {
	elapsedMs := elapsed.Milliseconds()
	if elapsedMs == 0 {
		elapsedMs = 1
	}

	p := models.BenchmarkProgress{
		ElapsedMs:    elapsedMs,
		TotalSent:    sent,
		TotalSuccess: success,
		TotalError:   errCount,
		CurrentQPS:   float64(sent) / elapsed.Seconds(),
		ErrorCodes:   errorCodes,
	}

	n := len(sortedLatencies)
	if n == 0 {
		return p
	}

	sort.Slice(sortedLatencies, func(i, j int) bool { return sortedLatencies[i] < sortedLatencies[j] })

	var sum int64
	for _, v := range sortedLatencies {
		sum += v
	}
	p.AvgLatencyMs = float64(sum) / float64(n)
	p.MinLatencyMs = float64(sortedLatencies[0])
	p.MaxLatencyMs = float64(sortedLatencies[n-1])
	p.P50Ms = percentile(sortedLatencies, 0.50)
	p.P90Ms = percentile(sortedLatencies, 0.90)
	p.P99Ms = percentile(sortedLatencies, 0.99)

	return p
}

func percentile(sorted []int64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(math.Ceil(p*float64(len(sorted)))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return float64(sorted[idx])
}

func buildLatencyBuckets(sorted []int64) []models.LatencyBucket {
	if len(sorted) == 0 {
		return nil
	}

	boundaries := []int64{1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000}

	maxLat := sorted[len(sorted)-1]
	var usedBounds []int64
	for _, b := range boundaries {
		usedBounds = append(usedBounds, b)
		if b > maxLat {
			break
		}
	}
	if usedBounds[len(usedBounds)-1] <= maxLat {
		usedBounds = append(usedBounds, maxLat+1)
	}

	buckets := make([]models.LatencyBucket, len(usedBounds))
	for i, b := range usedBounds {
		if i == 0 {
			buckets[i].LabelMs = fmt.Sprintf("≤%dms", b)
		} else {
			buckets[i].LabelMs = fmt.Sprintf("%d-%dms", usedBounds[i-1], b)
		}
	}

	for _, lat := range sorted {
		for i, b := range usedBounds {
			if lat <= b {
				buckets[i].Count++
				break
			}
		}
	}

	return buckets
}

// FindMethodDescriptor exposes method lookup for benchmark
func (c *Caller) FindMethodDescriptor(serviceName, methodName string) (*desc.MethodDescriptor, error) {
	return c.findMethodDescriptor(serviceName, methodName)
}
