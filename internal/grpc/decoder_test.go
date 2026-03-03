package grpc

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jhump/protoreflect/dynamic"
	"rpccall/internal/models"
)

const testProto = `syntax = "proto3";
package test.pb;

service Echo {
  rpc Ping (Req) returns (Resp);
}

message Req {
  string name = 1;
  bytes nested = 2;
}

message Resp {
  string out = 1;
}

message Nested {
  string inner = 1;
}
`

func setupDecoder(t *testing.T) (*Decoder, []byte) {
	t.Helper()
	dir := t.TempDir()
	protoPath := filepath.Join(dir, "test.proto")
	if err := os.WriteFile(protoPath, []byte(testProto), 0644); err != nil {
		t.Fatalf("write proto: %v", err)
	}

	parser := NewProtoParser()
	if _, err := parser.ParseFiles([]string{protoPath}, []string{dir}); err != nil {
		t.Fatalf("parse proto: %v", err)
	}
	decoder := NewDecoder(parser, nil)

	method, err := decoder.resolveMethodDescriptor("Echo", "Ping")
	if err != nil {
		t.Fatalf("resolve method: %v", err)
	}
	nestedDesc := parser.GetAllFileDescriptors()[0].FindMessage("test.pb.Nested")
	if nestedDesc == nil {
		t.Fatal("nested message not found")
	}
	nm := dynamic.NewMessage(nestedDesc)
	nm.SetFieldByName("inner", "value")
	nestedBytes, err := nm.Marshal()
	if err != nil {
		t.Fatalf("marshal nested: %v", err)
	}

	reqMsg := dynamic.NewMessage(method.GetInputType())
	reqMsg.SetFieldByName("name", "alice")
	reqMsg.SetFieldByName("nested", nestedBytes)
	payloadBytes, err := reqMsg.Marshal()
	if err != nil {
		t.Fatalf("marshal req: %v", err)
	}
	return decoder, payloadBytes
}

func decodeAndAssertOK(t *testing.T, d *Decoder, req models.DecodeRequest) map[string]any {
	t.Helper()
	resp := d.DecodePayload(req)
	if !resp.OK {
		t.Fatalf("decode failed: [%s] %s", resp.ErrorCode, resp.Error)
	}
	var out map[string]any
	if err := json.Unmarshal([]byte(resp.JSON), &out); err != nil {
		t.Fatalf("parse result json: %v", err)
	}
	return out
}

func TestDecodePayload_MultiEncoding(t *testing.T) {
	d, payload := setupDecoder(t)

	hexPayload := hex.EncodeToString(payload)
	outHex := decodeAndAssertOK(t, d, models.DecodeRequest{
		ServiceName: "Echo",
		MethodName:  "Ping",
		Target:      models.DecodeTargetInput,
		Payload:     hexPayload,
		Encoding:    models.DecodeEncodingHex,
	})
	if outHex["name"] != "alice" {
		t.Fatalf("unexpected hex decode name: %v", outHex["name"])
	}

	b64Payload := base64.StdEncoding.EncodeToString(payload)
	outB64 := decodeAndAssertOK(t, d, models.DecodeRequest{
		ServiceName: "Echo",
		MethodName:  "Ping",
		Target:      models.DecodeTargetInput,
		Payload:     b64Payload,
		Encoding:    models.DecodeEncodingBase64,
	})
	if outB64["name"] != "alice" {
		t.Fatalf("unexpected base64 decode name: %v", outB64["name"])
	}

	var sb strings.Builder
	for _, b := range payload {
		sb.WriteString(`\x`)
		sb.WriteString(hex.EncodeToString([]byte{b}))
	}
	outEscape := decodeAndAssertOK(t, d, models.DecodeRequest{
		ServiceName: "Echo",
		MethodName:  "Ping",
		Target:      models.DecodeTargetInput,
		Payload:     sb.String(),
		Encoding:    models.DecodeEncodingEscape,
	})
	if outEscape["name"] != "alice" {
		t.Fatalf("unexpected escape decode name: %v", outEscape["name"])
	}

	rawPath := filepath.Join(t.TempDir(), "data.bin")
	if err := os.WriteFile(rawPath, payload, 0644); err != nil {
		t.Fatalf("write raw payload: %v", err)
	}
	outRaw := decodeAndAssertOK(t, d, models.DecodeRequest{
		ServiceName: "Echo",
		MethodName:  "Ping",
		Target:      models.DecodeTargetInput,
		Payload:     rawPath,
		Encoding:    models.DecodeEncodingRaw,
	})
	if outRaw["name"] != "alice" {
		t.Fatalf("unexpected raw decode name: %v", outRaw["name"])
	}

	outByMessage := decodeAndAssertOK(t, d, models.DecodeRequest{
		Target:              models.DecodeTargetMessage,
		ExplicitMessageType: "test.pb.Req",
		Payload:             hexPayload,
		Encoding:            models.DecodeEncodingHex,
	})
	if outByMessage["name"] != "alice" {
		t.Fatalf("unexpected message decode name: %v", outByMessage["name"])
	}
}

func TestDecodePayload_ErrorCases(t *testing.T) {
	d, _ := setupDecoder(t)

	resp := d.DecodePayload(models.DecodeRequest{
		ServiceName: "Echo",
		MethodName:  "Ping",
		Target:      models.DecodeTargetInput,
		Payload:     "zzzz",
		Encoding:    models.DecodeEncodingHex,
	})
	if resp.OK || resp.ErrorCode != "invalid_payload_encoding" {
		t.Fatalf("expected invalid_payload_encoding, got ok=%v code=%s", resp.OK, resp.ErrorCode)
	}

	resp2 := d.DecodePayload(models.DecodeRequest{
		ServiceName: "Echo",
		MethodName:  "Ping",
		Target:      models.DecodeTargetMessage,
		Payload:     "00",
		Encoding:    models.DecodeEncodingHex,
	})
	if resp2.OK || resp2.ErrorCode != "message_not_found" {
		t.Fatalf("expected message_not_found, got ok=%v code=%s", resp2.OK, resp2.ErrorCode)
	}

	resp3 := d.DecodePayload(models.DecodeRequest{
		ServiceName: "Echo",
		MethodName:  "Ping",
		Target:      models.DecodeTargetInput,
		Payload:     "/path/not-exists.bin",
		Encoding:    models.DecodeEncodingRaw,
	})
	if resp3.OK {
		t.Fatalf("expected raw file decode failure")
	}
}

func TestDecodePayload_NestedRules(t *testing.T) {
	d, payload := setupDecoder(t)

	resp := d.DecodePayload(models.DecodeRequest{
		ServiceName: "Echo",
		MethodName:  "Ping",
		Target:      models.DecodeTargetInput,
		Payload:     hex.EncodeToString(payload),
		Encoding:    models.DecodeEncodingHex,
		NestedRules: []models.NestedDecodeRule{
			{FieldPath: "nested", MessageType: "test.pb.Nested"},
		},
	})
	if !resp.OK {
		t.Fatalf("decode failed: %s", resp.Error)
	}
	if resp.NestedHits != 1 {
		t.Fatalf("expected nested hits 1, got %d", resp.NestedHits)
	}

	var out map[string]any
	if err := json.Unmarshal([]byte(resp.JSON), &out); err != nil {
		t.Fatalf("parse json: %v", err)
	}
	nested, ok := out["nested"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested object, got %T", out["nested"])
	}
	if nested["inner"] != "value" {
		t.Fatalf("unexpected nested inner: %v", nested["inner"])
	}
}

func TestDecodeBatch_OrderAndStats(t *testing.T) {
	d, payload := setupDecoder(t)
	req := models.DecodeBatchRequest{
		Common: models.DecodeRequest{
			ServiceName: "Echo",
			MethodName:  "Ping",
			Target:      models.DecodeTargetInput,
			Encoding:    models.DecodeEncodingAuto,
		},
		Items: []string{hex.EncodeToString(payload), "not-valid-base64-%%%"},
	}
	resp := d.DecodeBatch(req)
	if resp.Total != 2 {
		t.Fatalf("unexpected total: %d", resp.Total)
	}
	if len(resp.Results) != 2 || resp.Results[0].Index != 0 || resp.Results[1].Index != 1 {
		t.Fatalf("batch results order is incorrect")
	}
	if resp.Success != 1 || resp.Failed != 1 {
		t.Fatalf("unexpected stats success=%d failed=%d", resp.Success, resp.Failed)
	}
}
