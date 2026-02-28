package models

type MethodType string

const (
	MethodTypeUnary           MethodType = "unary"
	MethodTypeServerStreaming MethodType = "server_streaming"
	MethodTypeClientStreaming MethodType = "client_streaming"
	MethodTypeBidiStreaming   MethodType = "bidi_streaming"
)

type ServiceMethod struct {
	ServiceName    string     `json:"serviceName"`
	MethodName     string     `json:"methodName"`
	FullName       string     `json:"fullName"`
	MethodType     MethodType `json:"methodType"`
	InputTypeName  string     `json:"inputTypeName"`
	OutputTypeName string     `json:"outputTypeName"`
}

type ServiceDefinition struct {
	Name     string          `json:"name"`
	FullName string          `json:"fullName"`
	Methods  []ServiceMethod `json:"methods"`
}

type ProtoFile struct {
	Path     string              `json:"path"`
	Services []ServiceDefinition `json:"services"`
}

type MetadataEntry struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type GrpcRequest struct {
	Address     string          `json:"address"`
	ServiceName string          `json:"serviceName"`
	MethodName  string          `json:"methodName"`
	Body        string          `json:"body"`
	Metadata    []MetadataEntry `json:"metadata"`
	UseTLS      bool            `json:"useTls"`
	CertPath    string          `json:"certPath"`
	KeyPath     string          `json:"keyPath"`
	CaPath      string          `json:"caPath"`
	TimeoutSec  int             `json:"timeoutSec"`
}

type TimingDetail struct {
	ConnectMs   float64 `json:"connectMs"`
	SerializeMs float64 `json:"serializeMs"`
	RpcMs       float64 `json:"rpcMs"`
	TotalMs   float64 `json:"totalMs"`
}

type GrpcResponse struct {
	Body       string          `json:"body"`
	Headers    []MetadataEntry `json:"headers"`
	Trailers   []MetadataEntry `json:"trailers"`
	StatusCode string          `json:"statusCode"`
	ElapsedMs  int64           `json:"elapsedMs"`
	Error      string          `json:"error,omitempty"`
	Timing     *TimingDetail   `json:"timing,omitempty"`
}

type FieldInfo struct {
	Name     string `json:"name"`
	TypeName string `json:"typeName"`
	Repeated bool   `json:"repeated"`
	MapEntry bool   `json:"mapEntry"`
}


type HistoryRecord struct {
	ID        int64       `json:"id"`
	Timestamp string      `json:"timestamp"`
	Request   GrpcRequest `json:"request"`
	Response  GrpcResponse `json:"response"`
}

// --- Benchmark ---

type BenchmarkConfig struct {
	Mode          string              `json:"mode"`          // "count", "duration", or "qps"
	Concurrency   int                 `json:"concurrency"`
	TotalRequests int                 `json:"totalRequests"` // mode=count
	DurationSec   int                 `json:"durationSec"`   // mode=duration or qps
	TargetQPS     int                 `json:"targetQps"`     // mode=qps
	RampUpEnabled bool                `json:"rampUpEnabled"`
	RampUpStepSec int                 `json:"rampUpStepSec"`
	RampUpStepAdd int                 `json:"rampUpStepAdd"`
	Variables     []BenchmarkVariable `json:"variables"`
}

type BenchmarkVariable struct {
	Name   string   `json:"name"`
	Type   string   `json:"type"` // "sequence" | "random_int" | "random_string" | "list"
	Min    int64    `json:"min"`
	Max    int64    `json:"max"`
	Values []string `json:"values"`
}

type BenchmarkProgress struct {
	ElapsedMs    int64            `json:"elapsedMs"`
	TotalSent    int64            `json:"totalSent"`
	TotalSuccess int64            `json:"totalSuccess"`
	TotalError   int64            `json:"totalError"`
	CurrentQPS   float64          `json:"currentQps"`
	AvgLatencyMs float64          `json:"avgLatencyMs"`
	P50Ms        float64          `json:"p50Ms"`
	P90Ms        float64          `json:"p90Ms"`
	P99Ms        float64          `json:"p99Ms"`
	MinLatencyMs float64          `json:"minLatencyMs"`
	MaxLatencyMs float64          `json:"maxLatencyMs"`
	ErrorCodes   map[string]int64 `json:"errorCodes"`
}

type BenchmarkResult struct {
	BenchmarkProgress
	Concurrency    int             `json:"concurrency"`
	DurationMs     int64           `json:"durationMs"`
	LatencyBuckets []LatencyBucket `json:"latencyBuckets"`
}

type LatencyBucket struct {
	LabelMs string `json:"labelMs"`
	Count   int64  `json:"count"`
}

// --- Chain Request ---

type ChainStep struct {
	Address     string          `json:"address"`
	ServiceName string          `json:"serviceName"`
	MethodName  string          `json:"methodName"`
	Body        string          `json:"body"`
	Metadata    []MetadataEntry `json:"metadata"`
	UseTLS      bool            `json:"useTls"`
	CertPath    string          `json:"certPath"`
	KeyPath     string          `json:"keyPath"`
	CaPath      string          `json:"caPath"`
}

type ChainResult struct {
	Steps []ChainStepResult `json:"steps"`
}

type ChainStepResult struct {
	Index      int    `json:"index"`
	StatusCode string `json:"statusCode"`
	Body       string `json:"body"`
	ElapsedMs  int64  `json:"elapsedMs"`
	Error      string `json:"error,omitempty"`
}
