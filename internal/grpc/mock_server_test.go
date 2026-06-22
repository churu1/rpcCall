package grpc

import (
	"net"
	"os"
	"path/filepath"
	"testing"

	"github.com/jhump/protoreflect/dynamic"
	"rpccall/internal/models"
)

func TestMockServerBuildsProtoResponseFromJSON(t *testing.T) {
	dir := t.TempDir()
	protoPath := filepath.Join(dir, "mock.proto")
	if err := os.WriteFile(protoPath, []byte(testProto), 0644); err != nil {
		t.Fatalf("write proto: %v", err)
	}

	parser := NewProtoParser()
	if _, err := parser.ParseFiles([]string{protoPath}, []string{dir}); err != nil {
		t.Fatalf("parse proto: %v", err)
	}

	server := NewMockServer()
	server.SetParser(parser)

	msg, err := server.buildResponseMessage(
		"/test.pb.Echo/Ping",
		&MockRule{
			ServiceName:  "test.pb.Echo",
			MethodName:   "Ping",
			StatusCode:   "OK",
			ResponseBody: `{"out":"pong"}`,
		},
	)
	if err != nil {
		t.Fatalf("build response: %v", err)
	}

	dynamicMsg, ok := msg.(*dynamic.Message)
	if !ok {
		t.Fatalf("expected dynamic response message, got %T", msg)
	}
	if got := dynamicMsg.GetFieldByName("out"); got != "pong" {
		t.Fatalf("expected out=pong, got %v", got)
	}
}

func TestMockServerUnaryCallReturnsProtoResponse(t *testing.T) {
	dir := t.TempDir()
	protoPath := filepath.Join(dir, "mock.proto")
	if err := os.WriteFile(protoPath, []byte(testProto), 0644); err != nil {
		t.Fatalf("write proto: %v", err)
	}

	parser := NewProtoParser()
	if _, err := parser.ParseFiles([]string{protoPath}, []string{dir}); err != nil {
		t.Fatalf("parse proto: %v", err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	address := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatalf("close listener: %v", err)
	}

	server := NewMockServer()
	server.SetParser(parser)
	server.SetRules([]MockRule{{
		ServiceName:  "test.pb.Echo",
		MethodName:   "Ping",
		StatusCode:   "OK",
		ResponseBody: `{"out":"pong"}`,
	}})
	if err := server.Start(port); err != nil {
		t.Fatalf("start mock server: %v", err)
	}
	defer server.Stop()

	caller := NewCaller()
	caller.SetParser(parser)
	resp, err := caller.InvokeUnary(models.GrpcRequest{
		ProjectID:   defaultProjectID,
		Address:     address,
		ServiceName: "test.pb.Echo",
		MethodName:  "Ping",
		Body:        `{"name":"alice"}`,
		TimeoutSec:  3,
	})
	if err != nil {
		t.Fatalf("invoke unary: %v", err)
	}
	if resp.StatusCode != "OK" {
		t.Fatalf("expected OK, got %+v", resp)
	}
	if resp.Body != "{\n  \"out\": \"pong\"\n}" {
		t.Fatalf("unexpected body: %s", resp.Body)
	}
}
