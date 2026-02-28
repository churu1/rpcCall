package httpclient

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"time"

	"rpccall/internal/models"
)

// Do sends an HTTP request and returns the response or an error.
func Do(req models.HttpRequest) (*models.HttpResponse, error) {
	timeout := time.Duration(req.TimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	client := &http.Client{Timeout: timeout}

	var body io.Reader
	if req.Body != "" && req.Method != "GET" && req.Method != "HEAD" {
		body = bytes.NewBufferString(req.Body)
	}

	httpReq, err := http.NewRequest(strings.ToUpper(req.Method), req.URL, body)
	if err != nil {
		return &models.HttpResponse{
			StatusCode: 0,
			Status:     "ERROR",
			Error:      err.Error(),
		}, nil
	}

	for _, h := range req.Headers {
		if h.Key != "" {
			httpReq.Header.Set(h.Key, h.Value)
		}
	}

	start := time.Now()
	resp, err := client.Do(httpReq)
	elapsedMs := time.Since(start).Milliseconds()

	if err != nil {
		return &models.HttpResponse{
			StatusCode: 0,
			Status:     "ERROR",
			ElapsedMs:  elapsedMs,
			Error:      err.Error(),
		}, nil
	}
	defer resp.Body.Close()

	out := &models.HttpResponse{
		StatusCode: resp.StatusCode,
		Status:     resp.Status,
		ElapsedMs:  elapsedMs,
		Headers:    make([]models.MetadataEntry, 0, len(resp.Header)),
	}
	for k, v := range resp.Header {
		if len(v) > 0 {
			out.Headers = append(out.Headers, models.MetadataEntry{Key: k, Value: strings.Join(v, ", ")})
		}
	}

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		out.Error = err.Error()
		return out, nil
	}
	out.Body = string(raw)
	return out, nil
}
