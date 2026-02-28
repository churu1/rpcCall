package report

import (
	"bytes"
	"html/template"
	"sort"
	"time"

	"rpccall/internal/models"
)

const reportTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RpcCall Benchmark Report</title>
<style>
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 24px; background: #f5f5f5; color: #333; }
.container { max-width: 900px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
h1 { margin: 0 0 24px; font-size: 24px; color: #1a1a1a; }
h2 { margin: 28px 0 12px; font-size: 18px; color: #333; }
table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; }
th { background: #f8f9fa; font-weight: 600; color: #555; }
tr:hover { background: #fafafa; }
.bar-chart { margin: 16px 0; }
.bar-row { display: flex; align-items: center; margin-bottom: 8px; }
.bar-label { width: 80px; font-size: 13px; color: #666; }
.bar-track { flex: 1; height: 24px; background: #e9ecef; border-radius: 4px; overflow: hidden; margin: 0 12px; }
.bar-fill { height: 100%; background: linear-gradient(90deg, #4dabf7, #228be6); border-radius: 4px; min-width: 2px; }
.error-codes { background: #fff5f5; border: 1px solid #ffc9c9; border-radius: 6px; padding: 12px; }
.timestamp { margin-top: 32px; font-size: 12px; color: #868e96; }
</style>
</head>
<body>
<div class="container">
<h1>RpcCall Benchmark Report</h1>

<h2>Summary</h2>
<table>
<tr><th>Metric</th><th>Value</th></tr>
<tr><td>Total Sent</td><td>{{.TotalSent}}</td></tr>
<tr><td>Success</td><td>{{.TotalSuccess}}</td></tr>
<tr><td>Error</td><td>{{.TotalError}}</td></tr>
<tr><td>Duration</td><td>{{.DurationMs}} ms</td></tr>
<tr><td>QPS</td><td>{{printf "%.2f" .CurrentQPS}}</td></tr>
<tr><td>Avg Latency</td><td>{{printf "%.2f" .AvgLatencyMs}} ms</td></tr>
</table>

<h2>Latency Distribution</h2>
<table>
<tr><th>Percentile</th><th>Latency (ms)</th></tr>
<tr><td>Min</td><td>{{printf "%.2f" .MinLatencyMs}}</td></tr>
<tr><td>P50</td><td>{{printf "%.2f" .P50Ms}}</td></tr>
<tr><td>P90</td><td>{{printf "%.2f" .P90Ms}}</td></tr>
<tr><td>P99</td><td>{{printf "%.2f" .P99Ms}}</td></tr>
<tr><td>Max</td><td>{{printf "%.2f" .MaxLatencyMs}}</td></tr>
</table>

{{if .ErrorCodesCount}}
<h2>Error Codes</h2>
<div class="error-codes">
{{range .ErrorCodesList}}
<p><strong>{{.Code}}</strong>: {{.Count}}</p>
{{end}}
</div>
{{end}}

{{if .LatencyBucketsCount}}
<h2>Latency Distribution (Buckets)</h2>
<div class="bar-chart">
{{range .LatencyBucketsList}}
<div class="bar-row">
<span class="bar-label">{{.Label}}</span>
<div class="bar-track"><div class="bar-fill" style="width: {{.Percent}}%"></div></div>
<span>{{.Count}}</span>
</div>
{{end}}
</div>
{{end}}

<p class="timestamp">Generated at {{.Timestamp}}</p>
</div>
</body>
</html>
`

var tmpl = template.Must(template.New("report").Parse(reportTemplate))

type templateData struct {
	models.BenchmarkResult
	ErrorCodesCount      int
	ErrorCodesList       []struct{ Code string; Count int64 }
	LatencyBucketsCount  int
	LatencyBucketsList   []struct{ Label string; Count int64; Percent float64 }
	Timestamp            string
}

func GenerateHTMLReport(result models.BenchmarkResult) (string, error) {
	maxCount := int64(0)
	for _, b := range result.LatencyBuckets {
		if b.Count > maxCount {
			maxCount = b.Count
		}
	}

	var errorCodesList []struct{ Code string; Count int64 }
	for code, count := range result.ErrorCodes {
		errorCodesList = append(errorCodesList, struct{ Code string; Count int64 }{code, count})
	}
	sort.Slice(errorCodesList, func(i, j int) bool { return errorCodesList[i].Count > errorCodesList[j].Count })

	var latencyBucketsList []struct{ Label string; Count int64; Percent float64 }
	for _, b := range result.LatencyBuckets {
		percent := 0.0
		if maxCount > 0 {
			percent = float64(b.Count) / float64(maxCount) * 100
		}
		latencyBucketsList = append(latencyBucketsList, struct {
			Label   string
			Count   int64
			Percent float64
		}{b.LabelMs, b.Count, percent})
	}

	data := templateData{
		BenchmarkResult:     result,
		ErrorCodesCount:     len(result.ErrorCodes),
		ErrorCodesList:      errorCodesList,
		LatencyBucketsCount: len(result.LatencyBuckets),
		LatencyBucketsList:  latencyBucketsList,
		Timestamp:           time.Now().Format(time.RFC3339),
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}