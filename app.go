package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jhump/protoreflect/desc"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"rpccall/internal/ai"
	grpclib "rpccall/internal/grpc"
	"rpccall/internal/history"
	"rpccall/internal/logger"
	"rpccall/internal/models"
	"rpccall/internal/report"
)

type App struct {
	ctx             context.Context
	caller          *grpclib.Caller
	decoder         *grpclib.Decoder
	parser          *grpclib.ProtoParser
	reflection      *grpclib.ReflectionClient
	mockServer      *grpclib.MockServer
	history         *history.Store
	aiClient        *ai.Client
	benchmarkCancel context.CancelFunc
	benchmarkMu     sync.Mutex
	lastBenchResult *models.BenchmarkResult
}

type WorkspaceExport struct {
	Version      string                     `json:"version"`
	ExportedAt   string                     `json:"exportedAt"`
	Addresses    []history.SavedAddress     `json:"addresses"`
	Environments []history.Environment      `json:"environments"`
	Collections  []CollectionExport         `json:"collections"`
	ProtoSources []history.SavedProtoSource `json:"protoSources"`
}

type CollectionExport struct {
	Name     string                 `json:"name"`
	Requests []history.SavedRequest `json:"requests"`
}

func NewApp() *App {
	parser := grpclib.NewProtoParser()
	reflection := grpclib.NewReflectionClient()
	caller := grpclib.NewCaller()
	caller.SetParser(parser)
	caller.SetReflection(reflection)

	historyStore, err := history.NewStore()
	if err != nil {
		logger.Error("failed to init history store: %v", err)
		historyStore = nil
	}

	aiClient, err := ai.NewClient()
	if err != nil {
		logger.Error("failed to init ai client: %v", err)
	}

	return &App{
		caller:     caller,
		decoder:    grpclib.NewDecoder(parser, reflection),
		parser:     parser,
		reflection: reflection,
		mockServer: grpclib.NewMockServer(),
		history:    historyStore,
		aiClient:   aiClient,
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(ctx context.Context) {
	a.mockServer.Stop()
	if a.history != nil {
		a.history.Close()
	}
}

func (a *App) StartMockServer(port int, rules []grpclib.MockRule) error {
	a.mockServer.SetRules(rules)
	return a.mockServer.Start(port)
}

func (a *App) StopMockServer() {
	a.mockServer.Stop()
}

func (a *App) IsMockServerRunning() bool {
	return a.mockServer.IsRunning()
}

func (a *App) GetMockServerPort() int {
	return a.mockServer.GetPort()
}

func (a *App) OpenProtoFileDialog() ([]models.ProtoFile, error) {
	logger.Info("OpenProtoFileDialog called")
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select .proto files",
		Filters: []runtime.FileFilter{
			{DisplayName: "Proto Files (*.proto)", Pattern: "*.proto"},
		},
	})
	if err != nil {
		logger.Error("file dialog error: %v", err)
		return nil, fmt.Errorf("file dialog error: %w", err)
	}
	if selection == "" {
		logger.Info("file dialog cancelled")
		return nil, nil
	}
	logger.Info("selected proto file: %s", selection)
	dir := filepath.Dir(selection)
	importPaths := []string{dir}
	result, err := a.ParseProtoFiles([]string{selection}, importPaths)
	if err != nil {
		logger.Error("ParseProtoFiles failed: %v", err)
	} else {
		logger.Info("ParseProtoFiles success: %d files parsed", len(result))
		if a.history != nil {
			a.history.SaveProtoSource("file", selection, importPaths)
		}
	}
	return result, err
}

func (a *App) OpenProtoDirDialog() ([]models.ProtoFile, error) {
	logger.Info("OpenProtoDirDialog called")
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select directory containing .proto files",
	})
	if err != nil {
		logger.Error("directory dialog error: %v", err)
		return nil, fmt.Errorf("directory dialog error: %w", err)
	}
	if dir == "" {
		logger.Info("directory dialog cancelled")
		return nil, nil
	}
	logger.Info("selected proto dir: %s", dir)
	result, err := a.parser.ParseDirectory(dir)
	if err != nil {
		logger.Error("ParseDirectory failed: %v", err)
	} else if a.history != nil {
		a.history.SaveProtoSource("directory", dir, nil)
	}
	return result, err
}

func (a *App) ParseProtoFiles(filePaths []string, importPaths []string) ([]models.ProtoFile, error) {
	return a.parser.ParseFiles(filePaths, importPaths)
}

func (a *App) ListServicesViaReflection(address string) ([]models.ServiceDefinition, error) {
	logger.Info("ListServicesViaReflection: %s", address)
	result, err := a.reflection.ListServices(address)
	if err != nil {
		logger.Error("reflection failed for %s: %v", address, err)
	} else {
		logger.Info("reflection success: %d services found", len(result))
	}
	return result, err
}

func (a *App) GetMethodTemplate(serviceName, methodName string) string {
	for _, fds := range a.parser.GetAllFileDescriptors() {
		for _, svc := range fds.GetServices() {
			if svc.GetFullyQualifiedName() == serviceName || svc.GetName() == serviceName {
				for _, md := range svc.GetMethods() {
					if md.GetName() == methodName {
						return grpclib.GenerateDefaultJSON(md.GetInputType())
					}
				}
			}
		}
	}

	svcDesc := a.reflection.GetServiceDescriptor(serviceName)
	if svcDesc != nil {
		for _, md := range svcDesc.GetMethods() {
			if md.GetName() == methodName {
				return grpclib.GenerateDefaultJSON(md.GetInputType())
			}
		}
	}

	return "{\n  \n}"
}

func (a *App) SelectCertFile() (string, error) {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select certificate/key file",
		Filters: []runtime.FileFilter{
			{DisplayName: "PEM Files (*.pem, *.crt, *.key)", Pattern: "*.pem;*.crt;*.key;*.cert"},
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
	if err != nil {
		return "", err
	}
	return selection, nil
}

func (a *App) SelectDecodeFile() (string, error) {
	selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select payload file",
		Filters: []runtime.FileFilter{
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
	if err != nil {
		return "", err
	}
	return selection, nil
}

func (a *App) resolveEnvVariables(req *models.GrpcRequest) {
	if a.history == nil {
		return
	}
	env, _ := a.history.GetActiveEnvironment()
	if env == nil || len(env.Variables) == 0 {
		return
	}
	for k, v := range env.Variables {
		placeholder := "{{" + k + "}}"
		req.Address = strings.ReplaceAll(req.Address, placeholder, v)
		req.Body = strings.ReplaceAll(req.Body, placeholder, v)
		for i := range req.Metadata {
			req.Metadata[i].Value = strings.ReplaceAll(req.Metadata[i].Value, placeholder, v)
		}
	}
}

func (a *App) InvokeUnary(req models.GrpcRequest) (*models.GrpcResponse, error) {
	a.resolveEnvVariables(&req)
	logger.Info("InvokeUnary: %s %s/%s", req.Address, req.ServiceName, req.MethodName)
	resp, err := a.caller.InvokeUnary(req)
	if err == nil && resp != nil && a.history != nil {
		a.history.Save(req, *resp)
	}
	return resp, err
}

func (a *App) InvokeClientStream(req models.GrpcRequest) (*models.GrpcResponse, error) {
	a.resolveEnvVariables(&req)
	resp, err := a.caller.InvokeClientStream(req)
	if err == nil && resp != nil && a.history != nil {
		a.history.Save(req, *resp)
	}
	return resp, err
}

func (a *App) InvokeServerStream(req models.GrpcRequest) error {
	a.resolveEnvVariables(&req)
	return a.caller.InvokeServerStream(req,
		func(msg string) {
			runtime.EventsEmit(a.ctx, "stream:message", msg)
		},
		func(resp models.GrpcResponse) {
			if a.history != nil {
				a.history.Save(req, resp)
			}
			runtime.EventsEmit(a.ctx, "stream:done", resp)
		},
	)
}

func (a *App) InvokeBidiStream(req models.GrpcRequest) error {
	a.resolveEnvVariables(&req)
	return a.caller.InvokeBidiStream(req,
		func(msg string) {
			runtime.EventsEmit(a.ctx, "stream:message", msg)
		},
		func(resp models.GrpcResponse) {
			if a.history != nil {
				a.history.Save(req, resp)
			}
			runtime.EventsEmit(a.ctx, "stream:done", resp)
		},
	)
}

func (a *App) InvokeChain(steps []models.ChainStep) (*models.ChainResult, error) {
	if len(steps) == 0 {
		return nil, fmt.Errorf("no steps provided")
	}

	result := &models.ChainResult{}
	var prevResponse map[string]interface{}

	re := regexp.MustCompile(`\{\{prev\.([^}]+)\}\}`)

	for i, step := range steps {
		req := models.GrpcRequest{
			Address:     step.Address,
			ServiceName: step.ServiceName,
			MethodName:  step.MethodName,
			Body:        step.Body,
			Metadata:    step.Metadata,
			UseTLS:      step.UseTLS,
			CertPath:    step.CertPath,
			KeyPath:     step.KeyPath,
			CaPath:      step.CaPath,
		}

		a.resolveEnvVariables(&req)

		if i > 0 && prevResponse != nil {
			req.Body = re.ReplaceAllStringFunc(req.Body, func(match string) string {
				groups := re.FindStringSubmatch(match)
				if len(groups) < 2 {
					return match
				}
				fieldName := groups[1]
				if val, ok := prevResponse[fieldName]; ok {
					switch v := val.(type) {
					case string:
						return v
					default:
						b, _ := json.Marshal(v)
						return string(b)
					}
				}
				return match
			})
		}

		resp, err := a.caller.InvokeUnary(req)
		stepResult := models.ChainStepResult{Index: i}

		if err != nil {
			stepResult.Error = err.Error()
			stepResult.StatusCode = "ERROR"
			result.Steps = append(result.Steps, stepResult)
			return result, nil
		}

		if resp != nil {
			stepResult.StatusCode = resp.StatusCode
			stepResult.Body = resp.Body
			stepResult.ElapsedMs = resp.ElapsedMs
			if resp.Error != "" {
				stepResult.Error = resp.Error
			}
		}

		result.Steps = append(result.Steps, stepResult)

		// Parse response for next step
		prevResponse = nil
		if resp != nil && resp.Body != "" {
			json.Unmarshal([]byte(resp.Body), &prevResponse)
		}

		// If error status, stop chain
		if resp != nil && resp.StatusCode != "OK" {
			return result, nil
		}
	}

	return result, nil
}

func (a *App) GetHistory(limit int) ([]history.HistoryEntry, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.List(limit)
}

func (a *App) GetHistoryDetail(id int64) (*history.HistoryDetail, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.GetDetail(id)
}

func (a *App) DeleteHistory(id int64) error {
	if a.history == nil {
		return nil
	}
	return a.history.Delete(id)
}

func (a *App) ClearHistory() error {
	if a.history == nil {
		return nil
	}
	return a.history.ClearAll()
}

// --- Saved Addresses ---

func (a *App) SaveAddress(name, address string) (*history.SavedAddress, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.SaveAddress(name, address)
}

func (a *App) ListAddresses() ([]history.SavedAddress, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.ListAddresses()
}

func (a *App) UpdateAddress(id int64, name, address string) error {
	if a.history == nil {
		return nil
	}
	return a.history.UpdateAddress(id, name, address)
}

func (a *App) DeleteAddress(id int64) error {
	if a.history == nil {
		return nil
	}
	return a.history.DeleteAddress(id)
}

// --- Saved Proto Sources ---

func (a *App) ListProtoSources() ([]history.SavedProtoSource, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.ListProtoSources()
}

func (a *App) LoadSavedProtos() ([]models.ProtoFile, error) {
	if a.history == nil {
		return nil, nil
	}
	sources, err := a.history.ListProtoSources()
	if err != nil {
		return nil, err
	}

	var allFiles []models.ProtoFile
	for _, src := range sources {
		var files []models.ProtoFile
		var parseErr error
		switch src.SourceType {
		case "file":
			if _, statErr := os.Stat(src.Path); statErr != nil {
				logger.Info("saved proto file no longer exists, skipping: %s", src.Path)
				continue
			}
			files, parseErr = a.parser.ParseFiles([]string{src.Path}, src.ImportPaths)
		case "directory":
			if _, statErr := os.Stat(src.Path); statErr != nil {
				logger.Info("saved proto dir no longer exists, skipping: %s", src.Path)
				continue
			}
			files, parseErr = a.parser.ParseDirectory(src.Path)
		}
		if parseErr != nil {
			logger.Error("failed to reload proto source %s: %v", src.Path, parseErr)
			continue
		}
		allFiles = append(allFiles, files...)
	}
	logger.Info("loaded %d proto files from %d saved sources", len(allFiles), len(sources))
	return allFiles, nil
}

func (a *App) DeleteProtoSource(id int64) error {
	if a.history == nil {
		return nil
	}
	return a.history.DeleteProtoSource(id)
}

func (a *App) ClearProtoSources() error {
	if a.history == nil {
		return nil
	}
	return a.history.ClearProtoSources()
}

// --- Environments ---

func (a *App) SaveEnvironment(name string, variables map[string]string) (*history.Environment, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.SaveEnvironment(name, variables)
}

func (a *App) ListEnvironments() ([]history.Environment, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.ListEnvironments()
}

func (a *App) UpdateEnvironment(id int64, name string, variables map[string]string) error {
	if a.history == nil {
		return nil
	}
	return a.history.UpdateEnvironment(id, name, variables)
}

func (a *App) DeleteEnvironment(id int64) error {
	if a.history == nil {
		return nil
	}
	return a.history.DeleteEnvironment(id)
}

func (a *App) SetActiveEnvironment(id int64) error {
	if a.history == nil {
		return nil
	}
	return a.history.SetActiveEnvironment(id)
}

func (a *App) GetActiveEnvironment() (*history.Environment, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.GetActiveEnvironment()
}

// --- Collections ---

func (a *App) SaveCollection(name string) (*history.Collection, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.SaveCollection(name)
}

func (a *App) ListCollections() ([]history.Collection, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.ListCollections()
}

func (a *App) UpdateCollection(id int64, name string) error {
	if a.history == nil {
		return nil
	}
	return a.history.UpdateCollection(id, name)
}

func (a *App) DeleteCollection(id int64) error {
	if a.history == nil {
		return nil
	}
	return a.history.DeleteCollection(id)
}

func (a *App) SaveRequestToCollection(req history.SavedRequest) (*history.SavedRequest, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.SaveRequest(req)
}

func (a *App) ListCollectionRequests(collectionID int64) ([]history.SavedRequest, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.ListRequests(collectionID)
}

func (a *App) DeleteSavedRequest(id int64) error {
	if a.history == nil {
		return nil
	}
	return a.history.DeleteRequest(id)
}

// --- Benchmark ---

func (a *App) StartBenchmark(req models.GrpcRequest, cfg models.BenchmarkConfig) error {
	a.benchmarkMu.Lock()
	if a.benchmarkCancel != nil {
		a.benchmarkMu.Unlock()
		return fmt.Errorf("benchmark already running")
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.benchmarkCancel = cancel
	a.benchmarkMu.Unlock()

	logger.Info("StartBenchmark: %s %s/%s concurrency=%d mode=%s",
		req.Address, req.ServiceName, req.MethodName, cfg.Concurrency, cfg.Mode)

	go func() {
		defer func() {
			a.benchmarkMu.Lock()
			a.benchmarkCancel = nil
			a.benchmarkMu.Unlock()
		}()

		err := a.caller.RunBenchmark(ctx, req, cfg,
			func(p models.BenchmarkProgress) {
				runtime.EventsEmit(a.ctx, "benchmark:progress", p)
			},
			func(r models.BenchmarkResult) {
				a.benchmarkMu.Lock()
				a.lastBenchResult = &r
				a.benchmarkMu.Unlock()
				runtime.EventsEmit(a.ctx, "benchmark:done", r)
				if a.history != nil {
					_ = a.history.SaveBenchmarkHistory(req.Address, req.ServiceName, req.MethodName, cfg, r)
				}
			},
		)
		if err != nil {
			logger.Error("benchmark error: %v", err)
			runtime.EventsEmit(a.ctx, "benchmark:error", err.Error())
		}
	}()

	return nil
}

func (a *App) StopBenchmark() error {
	a.benchmarkMu.Lock()
	defer a.benchmarkMu.Unlock()
	if a.benchmarkCancel != nil {
		a.benchmarkCancel()
		logger.Info("benchmark stopped by user")
		return nil
	}
	return fmt.Errorf("no benchmark running")
}

func (a *App) ExportBenchmarkResult(result models.BenchmarkResult, format string) (string, error) {
	savePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export Benchmark Result",
		DefaultFilename: "benchmark_result." + format,
	})
	if err != nil {
		return "", err
	}
	if savePath == "" {
		return "", nil
	}

	switch format {
	case "csv":
		return savePath, exportBenchmarkCSV(savePath, result)
	default:
		return savePath, exportBenchmarkJSON(savePath, result)
	}
}

func exportBenchmarkJSON(path string, result models.BenchmarkResult) error {
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func exportBenchmarkCSV(path string, result models.BenchmarkResult) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	w := csv.NewWriter(f)
	defer w.Flush()

	w.Write([]string{"Metric", "Value"})
	w.Write([]string{"Total Sent", fmt.Sprintf("%d", result.TotalSent)})
	w.Write([]string{"Total Success", fmt.Sprintf("%d", result.TotalSuccess)})
	w.Write([]string{"Total Error", fmt.Sprintf("%d", result.TotalError)})
	w.Write([]string{"Duration (ms)", fmt.Sprintf("%d", result.DurationMs)})
	w.Write([]string{"QPS", fmt.Sprintf("%.2f", result.CurrentQPS)})
	w.Write([]string{"Avg Latency (ms)", fmt.Sprintf("%.2f", result.AvgLatencyMs)})
	w.Write([]string{"P50 (ms)", fmt.Sprintf("%.2f", result.P50Ms)})
	w.Write([]string{"P90 (ms)", fmt.Sprintf("%.2f", result.P90Ms)})
	w.Write([]string{"P99 (ms)", fmt.Sprintf("%.2f", result.P99Ms)})
	w.Write([]string{"Min Latency (ms)", fmt.Sprintf("%.2f", result.MinLatencyMs)})
	w.Write([]string{"Max Latency (ms)", fmt.Sprintf("%.2f", result.MaxLatencyMs)})
	w.Write([]string{"Concurrency", fmt.Sprintf("%d", result.Concurrency)})

	if len(result.ErrorCodes) > 0 {
		w.Write([]string{"", ""})
		w.Write([]string{"Error Code", "Count"})
		for code, count := range result.ErrorCodes {
			w.Write([]string{code, fmt.Sprintf("%d", count)})
		}
	}

	if len(result.LatencyBuckets) > 0 {
		w.Write([]string{"", ""})
		w.Write([]string{"Latency Bucket", "Count"})
		for _, b := range result.LatencyBuckets {
			w.Write([]string{b.LabelMs, fmt.Sprintf("%d", b.Count)})
		}
	}

	return nil
}

func (a *App) SaveBenchmarkHistory(address, serviceName, methodName string, config models.BenchmarkConfig, result models.BenchmarkResult) error {
	if a.history == nil {
		return nil
	}
	return a.history.SaveBenchmarkHistory(address, serviceName, methodName, config, result)
}

func (a *App) ListBenchmarkHistory(limit int) ([]history.BenchmarkHistoryEntry, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.ListBenchmarkHistory(limit)
}

func (a *App) DeleteBenchmarkHistory(id int64) error {
	if a.history == nil {
		return nil
	}
	return a.history.DeleteBenchmarkHistory(id)
}

func (a *App) ClearBenchmarkHistory() error {
	if a.history == nil {
		return nil
	}
	return a.history.ClearBenchmarkHistory()
}

// --- Chain Templates ---

func (a *App) SaveChainTemplate(name string, stepsJSON string) (*history.ChainTemplate, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.SaveChainTemplate(name, stepsJSON)
}

func (a *App) ListChainTemplates() ([]history.ChainTemplate, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.ListChainTemplates()
}

func (a *App) UpdateChainTemplate(id int64, name string, stepsJSON string) error {
	if a.history == nil {
		return nil
	}
	return a.history.UpdateChainTemplate(id, name, stepsJSON)
}

func (a *App) DeleteChainTemplate(id int64) error {
	if a.history == nil {
		return nil
	}
	return a.history.DeleteChainTemplate(id)
}

func (a *App) ExportBenchmarkHTML(result models.BenchmarkResult) (string, error) {
	html, err := report.GenerateHTMLReport(result)
	if err != nil {
		return "", err
	}
	savePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export Benchmark Report",
		DefaultFilename: "benchmark_report.html",
		Filters: []runtime.FileFilter{
			{DisplayName: "HTML Files (*.html)", Pattern: "*.html"},
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
	if err != nil {
		return "", err
	}
	if savePath == "" {
		return "", nil
	}
	if err := os.WriteFile(savePath, []byte(html), 0644); err != nil {
		return "", err
	}
	return savePath, nil
}

func (a *App) GetMessageFields(serviceName, methodName string) []models.FieldInfo {
	fields := a.parser.GetMessageFields(serviceName, methodName)
	if fields != nil {
		return fields
	}
	svcDesc := a.reflection.GetServiceDescriptor(serviceName)
	if svcDesc != nil {
		for _, md := range svcDesc.GetMethods() {
			if md.GetName() == methodName {
				return grpclib.ExtractFieldsFromDesc(md.GetInputType())
			}
		}
	}
	return nil
}

func findMessageDescriptorInFile(fd *desc.FileDescriptor, messageType string) *desc.MessageDescriptor {
	if fd == nil {
		return nil
	}
	for _, md := range fd.GetMessageTypes() {
		if hit := findMessageDescriptorRecursive(md, messageType); hit != nil {
			return hit
		}
	}
	return nil
}

func findMessageDescriptorRecursive(md *desc.MessageDescriptor, messageType string) *desc.MessageDescriptor {
	if md == nil {
		return nil
	}
	if md.GetFullyQualifiedName() == messageType || md.GetName() == messageType {
		return md
	}
	for _, nested := range md.GetNestedMessageTypes() {
		if hit := findMessageDescriptorRecursive(nested, messageType); hit != nil {
			return hit
		}
	}
	return nil
}

func (a *App) GetMessageTypeFields(messageType string) []models.FieldInfo {
	mt := strings.TrimSpace(messageType)
	if mt == "" {
		return nil
	}

	for _, fd := range a.parser.GetAllFileDescriptors() {
		if md := findMessageDescriptorInFile(fd, mt); md != nil {
			return grpclib.ExtractFieldsFromDesc(md)
		}
	}

	for _, svc := range a.reflection.GetAllServiceDescriptors() {
		fd := svc.GetFile()
		if md := findMessageDescriptorInFile(fd, mt); md != nil {
			return grpclib.ExtractFieldsFromDesc(md)
		}
	}
	return nil
}

func (a *App) GetAllMessageTypes() []string {
	allMessages := make(map[string]struct{})

	addMessage := func(name string) {
		if name == "" {
			return
		}
		allMessages[name] = struct{}{}
	}

	var walkDesc func(md *desc.MessageDescriptor)
	walkDesc = func(md *desc.MessageDescriptor) {
		if md == nil {
			return
		}
		addMessage(md.GetFullyQualifiedName())
		for _, nested := range md.GetNestedMessageTypes() {
			walkDesc(nested)
		}
	}

	for _, fd := range a.parser.GetAllFileDescriptors() {
		for _, md := range fd.GetMessageTypes() {
			walkDesc(md)
		}
	}

	for _, svc := range a.reflection.GetAllServiceDescriptors() {
		fd := svc.GetFile()
		if fd == nil {
			continue
		}
		for _, md := range fd.GetMessageTypes() {
			walkDesc(md)
		}
	}

	out := make([]string, 0, len(allMessages))
	for k := range allMessages {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func (a *App) DecodePayload(req models.DecodeRequest) (*models.DecodeResponse, error) {
	if a.decoder == nil {
		return nil, fmt.Errorf("decoder not initialized")
	}
	if req.Target == "" {
		req.Target = models.DecodeTargetInput
	}
	if req.Encoding == "" {
		req.Encoding = models.DecodeEncodingAuto
	}
	resp := a.decoder.DecodePayload(req)
	if a.history != nil {
		_ = a.history.SaveDecodeHistory(req, resp)
	}
	return resp, nil
}

func (a *App) DecodeBatch(req models.DecodeBatchRequest) (*models.DecodeBatchResponse, error) {
	if a.decoder == nil {
		return nil, fmt.Errorf("decoder not initialized")
	}
	if req.Common.Target == "" {
		req.Common.Target = models.DecodeTargetInput
	}
	if req.Common.Encoding == "" {
		req.Common.Encoding = models.DecodeEncodingAuto
	}
	resp := a.decoder.DecodeBatch(req)
	if a.history != nil {
		for i, item := range resp.Results {
			itemReq := req.Common
			if i < len(req.Items) {
				itemReq.Payload = req.Items[i]
			}
			itemResp := &models.DecodeResponse{
				OK:               item.OK,
				DetectedEncoding: item.DetectedEncoding,
				JSON:             item.JSON,
				Warnings:         item.Warnings,
				ElapsedMs:        item.ElapsedMs,
				NestedHits:       item.NestedHits,
				ErrorCode:        item.ErrorCode,
				Error:            item.Error,
			}
			_ = a.history.SaveDecodeHistory(itemReq, itemResp)
		}
	}
	return resp, nil
}

func (a *App) GetDecodeHistory(limit int) ([]history.DecodeHistoryEntry, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.ListDecodeHistory(limit)
}

func (a *App) GetDecodeHistoryDetail(id int64) (*history.DecodeHistoryDetail, error) {
	if a.history == nil {
		return nil, nil
	}
	return a.history.GetDecodeHistoryDetail(id)
}

func (a *App) DeleteDecodeHistory(id int64) error {
	if a.history == nil {
		return nil
	}
	return a.history.DeleteDecodeHistory(id)
}

func (a *App) ClearDecodeHistory() error {
	if a.history == nil {
		return nil
	}
	return a.history.ClearDecodeHistory()
}

func (a *App) ExportWorkspace() (string, error) {
	if a.history == nil {
		return "", fmt.Errorf("history store not available")
	}
	savePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export Workspace",
		DefaultFilename: "rpccall_workspace.json",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
	if err != nil {
		return "", fmt.Errorf("file dialog error: %w", err)
	}
	if savePath == "" {
		return "", nil
	}

	addresses, err := a.history.ListAddresses()
	if err != nil {
		return "", fmt.Errorf("list addresses: %w", err)
	}
	environments, err := a.history.ListEnvironments()
	if err != nil {
		return "", fmt.Errorf("list environments: %w", err)
	}
	protoSources, err := a.history.ListProtoSources()
	if err != nil {
		return "", fmt.Errorf("list proto sources: %w", err)
	}

	collections, err := a.history.ListCollections()
	if err != nil {
		return "", fmt.Errorf("list collections: %w", err)
	}
	var collectionExports []CollectionExport
	for _, col := range collections {
		reqs, err := a.history.ListRequests(col.ID)
		if err != nil {
			return "", fmt.Errorf("list requests for collection %s: %w", col.Name, err)
		}
		collectionExports = append(collectionExports, CollectionExport{
			Name:     col.Name,
			Requests: reqs,
		})
	}

	exp := WorkspaceExport{
		Version:      "1",
		ExportedAt:   time.Now().Format(time.RFC3339),
		Addresses:    addresses,
		Environments: environments,
		Collections:  collectionExports,
		ProtoSources: protoSources,
	}
	data, err := json.MarshalIndent(exp, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal export: %w", err)
	}
	if err := os.WriteFile(savePath, data, 0644); err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}
	return savePath, nil
}

func (a *App) ImportWorkspace() error {
	if a.history == nil {
		return fmt.Errorf("history store not available")
	}
	openPath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Import Workspace",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
	if err != nil {
		return fmt.Errorf("file dialog error: %w", err)
	}
	if openPath == "" {
		return nil
	}

	data, err := os.ReadFile(openPath)
	if err != nil {
		return fmt.Errorf("read file: %w", err)
	}
	var exp WorkspaceExport
	if err := json.Unmarshal(data, &exp); err != nil {
		return fmt.Errorf("parse JSON: %w", err)
	}

	for _, addr := range exp.Addresses {
		if _, err := a.history.SaveAddress(addr.Name, addr.Address); err != nil {
			logger.Error("import address %s: %v", addr.Name, err)
		}
	}
	for _, env := range exp.Environments {
		created, err := a.history.SaveEnvironment(env.Name, env.Variables)
		if err != nil {
			logger.Error("import environment %s: %v", env.Name, err)
			continue
		}
		if env.IsActive && created != nil {
			_ = a.history.SetActiveEnvironment(created.ID)
		}
	}
	for _, col := range exp.Collections {
		created, err := a.history.SaveCollection(col.Name)
		if err != nil {
			logger.Error("import collection %s: %v", col.Name, err)
			continue
		}
		for _, req := range col.Requests {
			req.CollectionID = created.ID
			if _, err := a.history.SaveRequest(req); err != nil {
				logger.Error("import request %s: %v", req.Name, err)
			}
		}
	}
	return nil
}

func (a *App) GetLogPath() string {
	execPath, err := os.Executable()
	if err != nil {
		return ""
	}
	projectDir := filepath.Dir(filepath.Dir(filepath.Dir(filepath.Dir(execPath))))
	if _, err := os.Stat(filepath.Join(projectDir, "go.mod")); err != nil {
		projectDir, _ = os.Getwd()
	}
	return filepath.Join(projectDir, "logs", "rpccall.log")
}

// --- AI ---

type AIConfig struct {
	Endpoint string `json:"endpoint"`
	APIKey   string `json:"apiKey"`
	Model    string `json:"model"`
}

func (a *App) GetAIConfig() AIConfig {
	if a.aiClient == nil {
		return AIConfig{}
	}
	cfg := a.aiClient.GetConfig()
	return AIConfig{Endpoint: cfg.Endpoint, APIKey: cfg.APIKey, Model: cfg.Model}
}

func (a *App) SaveAIConfig(cfg AIConfig) error {
	if a.aiClient == nil {
		return fmt.Errorf("AI client not initialized")
	}
	return a.aiClient.SaveConfig(ai.Config{
		Endpoint: cfg.Endpoint,
		APIKey:   cfg.APIKey,
		Model:    cfg.Model,
	})
}

func (a *App) AIGenerateBody(serviceName, methodName string) (string, error) {
	if a.aiClient == nil {
		return "", fmt.Errorf("AI client not initialized")
	}
	if !a.aiClient.IsConfigured() {
		return "", fmt.Errorf("AI not configured. Please set API Key and Endpoint in settings.")
	}
	fields := a.GetMessageFields(serviceName, methodName)
	logger.Info("AI generate: %s/%s, fields=%d", serviceName, methodName, len(fields))
	result, err := a.aiClient.GenerateRequestBody(serviceName, methodName, fields)
	if err != nil {
		logger.Error("AI generate failed: %v", err)
		return "", err
	}
	logger.Info("AI generate success, len=%d", len(result))
	return result, nil
}

func (a *App) AIAnalyzeResponse(serviceName, methodName, responseBody, statusCode string) (string, error) {
	if a.aiClient == nil {
		return "", fmt.Errorf("AI client not initialized")
	}
	if !a.aiClient.IsConfigured() {
		return "", fmt.Errorf("AI not configured. Please set API Key and Endpoint in settings.")
	}
	logger.Info("AI analyze: %s/%s, status=%s, bodyLen=%d", serviceName, methodName, statusCode, len(responseBody))
	result, err := a.aiClient.AnalyzeResponse(serviceName, methodName, responseBody, statusCode)
	if err != nil {
		logger.Error("AI analyze failed: %v", err)
		return "", err
	}
	logger.Info("AI analyze success, len=%d", len(result))
	return result, nil
}

type TrailerEntry struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func (a *App) AIDiagnoseError(serviceName, methodName, statusCode, errorMessage string, trailers []TrailerEntry) (string, error) {
	if a.aiClient == nil {
		return "", fmt.Errorf("AI client not initialized")
	}
	if !a.aiClient.IsConfigured() {
		return "", fmt.Errorf("AI not configured. Please set API Key and Endpoint in settings.")
	}
	mTrailers := make([]models.MetadataEntry, len(trailers))
	for i, t := range trailers {
		mTrailers[i] = models.MetadataEntry{Key: t.Key, Value: t.Value}
	}
	logger.Info("AI diagnose: %s/%s, status=%s, err=%s", serviceName, methodName, statusCode, errorMessage)
	result, err := a.aiClient.DiagnoseError(serviceName, methodName, statusCode, errorMessage, mTrailers)
	if err != nil {
		logger.Error("AI diagnose failed: %v", err)
		return "", err
	}
	logger.Info("AI diagnose success, len=%d", len(result))
	return result, nil
}
