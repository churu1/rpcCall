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
	Path        string              `json:"path"`
	ProjectID   string              `json:"projectId"`
	ProjectName string              `json:"projectName"`
	Services    []ServiceDefinition `json:"services"`
}

type ProtoProject struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

type MetadataEntry struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type GrpcRequest struct {
	ProjectID   string          `json:"projectId"`
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
	TotalMs     float64 `json:"totalMs"`
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
	FieldNumber int32  `json:"fieldNumber"`
	Name        string `json:"name"`
	TypeName    string `json:"typeName"`
	Repeated    bool   `json:"repeated"`
	MapEntry    bool   `json:"mapEntry"`
}

type HistoryRecord struct {
	ID        int64        `json:"id"`
	Timestamp string       `json:"timestamp"`
	Request   GrpcRequest  `json:"request"`
	Response  GrpcResponse `json:"response"`
}

// --- Benchmark ---

type BenchmarkConfig struct {
	Mode          string              `json:"mode"` // "count", "duration", or "qps"
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
	ProjectID   string          `json:"projectId"`
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

// --- Decode ---

type DecodeEncoding string

const (
	DecodeEncodingAuto   DecodeEncoding = "auto"
	DecodeEncodingHex    DecodeEncoding = "hex"
	DecodeEncodingBase64 DecodeEncoding = "base64"
	DecodeEncodingEscape DecodeEncoding = "escape"
	DecodeEncodingRaw    DecodeEncoding = "raw"
)

type DecodeTarget string

const (
	DecodeTargetInput   DecodeTarget = "input"
	DecodeTargetOutput  DecodeTarget = "output"
	DecodeTargetMessage DecodeTarget = "message"
)

type NestedDecodeRule struct {
	FieldPath   string   `json:"fieldPath"`
	MessageType string   `json:"messageType"`
	ProtoPath   string   `json:"protoPath,omitempty"`
	ImportPaths []string `json:"importPaths,omitempty"`
}

type DecodeRequest struct {
	ProjectID           string             `json:"projectId"`
	ServiceName         string             `json:"serviceName"`
	MethodName          string             `json:"methodName"`
	Target              DecodeTarget       `json:"target"`
	ExplicitMessageType string             `json:"explicitMessageType"`
	Payload             string             `json:"payload"`
	Encoding            DecodeEncoding     `json:"encoding"`
	NestedRules         []NestedDecodeRule `json:"nestedRules"`
}

type DecodeResponse struct {
	OK               bool           `json:"ok"`
	DetectedEncoding DecodeEncoding `json:"detectedEncoding"`
	JSON             string         `json:"json"`
	RawTags          []DecodeRawTag `json:"rawTags,omitempty"`
	Warnings         []string       `json:"warnings"`
	ElapsedMs        int64          `json:"elapsedMs"`
	NestedHits       int            `json:"nestedHits"`
	ErrorCode        string         `json:"errorCode,omitempty"`
	Error            string         `json:"error,omitempty"`
}

type DecodeBatchRequest struct {
	Common DecodeRequest `json:"common"`
	Items  []string      `json:"items"`
}

type DecodeItemResult struct {
	Index            int            `json:"index"`
	OK               bool           `json:"ok"`
	DetectedEncoding DecodeEncoding `json:"detectedEncoding"`
	JSON             string         `json:"json"`
	RawTags          []DecodeRawTag `json:"rawTags,omitempty"`
	NestedHits       int            `json:"nestedHits"`
	ErrorCode        string         `json:"errorCode,omitempty"`
	Error            string         `json:"error,omitempty"`
	Warnings         []string       `json:"warnings"`
	ElapsedMs        int64          `json:"elapsedMs"`
}

type DecodeRawTag struct {
	FieldNumber int32 `json:"fieldNumber"`
	WireType    int32 `json:"wireType"`
	Count       int32 `json:"count"`
}

type DecodeBatchResponse struct {
	Total   int                `json:"total"`
	Success int                `json:"success"`
	Failed  int                `json:"failed"`
	Results []DecodeItemResult `json:"results"`
}
