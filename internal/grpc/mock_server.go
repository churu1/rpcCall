package grpc

import (
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/golang/protobuf/proto"
	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/dynamic"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"rpccall/internal/logger"
)

type MockRule struct {
	ServiceName  string `json:"serviceName"`
	MethodName   string `json:"methodName"`
	StatusCode   string `json:"statusCode"`
	DelayMs      int    `json:"delayMs"`
	ResponseBody string `json:"responseBody"`
}

type rawBytes []byte

func (r rawBytes) Marshal() ([]byte, error) { return r, nil }
func (r rawBytes) Unmarshal(b []byte) error { return nil }
func (r rawBytes) ProtoMessage()            {}
func (r rawBytes) Reset()                   {}
func (r rawBytes) String() string           { return string(r) }

type MockServer struct {
	mu       sync.Mutex
	rules    []MockRule
	parser   *ProtoParser
	server   *grpc.Server
	listener net.Listener
	port     int
	running  bool
}

func NewMockServer() *MockServer {
	return &MockServer{}
}

func (m *MockServer) SetParser(parser *ProtoParser) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.parser = parser
}

func (m *MockServer) SetRules(rules []MockRule) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rules = rules
}

func (m *MockServer) GetRules() []MockRule {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]MockRule{}, m.rules...)
}

func (m *MockServer) findRule(fullMethod string) *MockRule {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.rules {
		target := "/" + r.ServiceName + "/" + r.MethodName
		if target == fullMethod {
			return &r
		}
	}
	return nil
}

func (m *MockServer) findMethodDescriptor(fullMethod string) (*desc.MethodDescriptor, error) {
	parts := strings.Split(strings.TrimPrefix(fullMethod, "/"), "/")
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid full method %s", fullMethod)
	}
	serviceName, methodName := parts[0], parts[1]

	m.mu.Lock()
	parser := m.parser
	m.mu.Unlock()
	if parser == nil {
		return nil, fmt.Errorf("proto parser not configured")
	}

	for projectID := range parser.fileDescriptors {
		for _, fd := range parser.GetAllFileDescriptorsByProject(projectID) {
			for _, svc := range fd.GetServices() {
				if svc.GetFullyQualifiedName() != serviceName && svc.GetName() != serviceName {
					continue
				}
				for _, method := range svc.GetMethods() {
					if method.GetName() == methodName {
						return method, nil
					}
				}
			}
		}
	}
	return nil, fmt.Errorf("method descriptor not found for %s", fullMethod)
}

func (m *MockServer) buildResponseMessage(fullMethod string, rule *MockRule) (proto.Message, error) {
	methodDesc, err := m.findMethodDescriptor(fullMethod)
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	parser := m.parser
	m.mu.Unlock()
	codec := newDynamicJSONCodec(collectAllParserFiles(parser))
	msg := codec.newMessage(methodDesc.GetOutputType())
	if strings.TrimSpace(rule.ResponseBody) == "" {
		return msg, nil
	}
	if err := codec.unmarshal(msg, []byte(rule.ResponseBody)); err != nil {
		return nil, fmt.Errorf("invalid mock response JSON for %s: %w", fullMethod, err)
	}
	return msg, nil
}

func (m *MockServer) buildRequestMessage(fullMethod string) (proto.Message, error) {
	methodDesc, err := m.findMethodDescriptor(fullMethod)
	if err != nil {
		return nil, err
	}
	return dynamic.NewMessage(methodDesc.GetInputType()), nil
}

func (m *MockServer) Start(port int) error {
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return fmt.Errorf("mock server already running on port %d", m.port)
	}
	m.mu.Unlock()

	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return fmt.Errorf("failed to listen on port %d: %w", port, err)
	}

	srv := grpc.NewServer(
		grpc.UnknownServiceHandler(m.unknownHandler),
	)

	m.mu.Lock()
	m.server = srv
	m.listener = lis
	m.port = port
	m.running = true
	m.mu.Unlock()

	logger.Info("Mock server starting on port %d", port)

	go func() {
		if err := srv.Serve(lis); err != nil {
			logger.Error("mock server error: %v", err)
		}
		m.mu.Lock()
		m.running = false
		m.mu.Unlock()
	}()

	return nil
}

func (m *MockServer) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.server != nil && m.running {
		m.server.GracefulStop()
		m.running = false
		logger.Info("Mock server stopped")
	}
}

func (m *MockServer) IsRunning() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.running
}

func (m *MockServer) GetPort() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.port
}

func parseGrpcCode(s string) codes.Code {
	switch s {
	case "OK":
		return codes.OK
	case "NOT_FOUND":
		return codes.NotFound
	case "INVALID_ARGUMENT":
		return codes.InvalidArgument
	case "PERMISSION_DENIED":
		return codes.PermissionDenied
	case "UNAUTHENTICATED":
		return codes.Unauthenticated
	case "UNAVAILABLE":
		return codes.Unavailable
	case "DEADLINE_EXCEEDED":
		return codes.DeadlineExceeded
	case "ALREADY_EXISTS":
		return codes.AlreadyExists
	case "RESOURCE_EXHAUSTED":
		return codes.ResourceExhausted
	case "CANCELLED":
		return codes.Canceled
	default:
		return codes.Internal
	}
}

func (m *MockServer) unknownHandler(srv interface{}, stream grpc.ServerStream) error {
	fullMethod, _ := grpc.MethodFromServerStream(stream)
	rule := m.findRule(fullMethod)
	if rule == nil {
		return status.Errorf(codes.Unimplemented, "no mock rule for %s", fullMethod)
	}

	if rule.DelayMs > 0 {
		time.Sleep(time.Duration(rule.DelayMs) * time.Millisecond)
	}

	in, err := m.buildRequestMessage(fullMethod)
	if err != nil {
		return status.Errorf(codes.Internal, "%v", err)
	}
	if err := stream.RecvMsg(in); err != nil {
		return status.Errorf(codes.Internal, "failed to receive mock request: %v", err)
	}

	if rule.StatusCode != "" && rule.StatusCode != "OK" {
		return status.Errorf(parseGrpcCode(rule.StatusCode), "mock error for %s", fullMethod)
	}

	msg, err := m.buildResponseMessage(fullMethod, rule)
	if err != nil {
		return status.Errorf(codes.Internal, "%v", err)
	}
	if err := stream.SendMsg(msg); err != nil {
		return status.Errorf(codes.Internal, "failed to send mock response: %v", err)
	}

	return nil
}
