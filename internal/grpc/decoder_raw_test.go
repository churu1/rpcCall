package grpc

import (
	"encoding/json"
	"testing"
)

const sampleSpecData = "ChwIARIG6IGK5aSpGgcjRjRFN0ZGIgcjQzg4N0ZGGJGzt7gJOA9AD4oBAIoBAIoBAIoBAIoBAIoBANgBuBfgAQb6AQtub3JtYWxfcm9vbYICOW1lZGlhLzIwMjYvMDQvMjEvMjc3NDIzZDktNzFkYy00OTcxLWJjZGItMWExOGJlNmNiNjAxLnBuZw=="

func TestDecodeJSONProtobufFields(t *testing.T) {
	body := `{"elements":[{"specData":"` + sampleSpecData + `","plain":"hello"}]}`
	out := DecodeJSONProtobufFields(body)

	var decoded map[string]json.RawMessage
	if err := json.Unmarshal([]byte(out), &decoded); err != nil {
		t.Fatalf("decode response is not valid JSON: %v", err)
	}
	raw, ok := decoded[sampleSpecData]
	if !ok {
		t.Fatalf("expected specData to be decoded, got keys=%d", len(decoded))
	}

	var fields map[string]any
	if err := json.Unmarshal(raw, &fields); err != nil {
		t.Fatalf("decoded protobuf is not valid JSON: %v", err)
	}
	if fields["3"] != float64(2534267281) {
		t.Fatalf("unexpected field 3: %#v", fields["3"])
	}
	if _, ok := fields["1"].(map[string]any); !ok {
		t.Fatalf("expected nested field 1 to be an object: %#v", fields["1"])
	}
	if fields["31"] != "normal_room" {
		t.Fatalf("unexpected field 31: %#v", fields["31"])
	}
	if _, ok := decoded["hello"]; ok {
		t.Fatalf("plain text should not be treated as base64 protobuf")
	}
}

func TestParseRawProtobufRepeatedBytes(t *testing.T) {
	raw := []byte{0x0a, 0x01, 'a', 0x0a, 0x02, 'b', 'c'}
	msg, err := parseRawProtobuf(raw)
	if err != nil {
		t.Fatalf("parse raw protobuf: %v", err)
	}
	out, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal raw protobuf: %v", err)
	}

	var fields map[string]any
	if err := json.Unmarshal(out, &fields); err != nil {
		t.Fatalf("decoded protobuf is not valid JSON: %v", err)
	}
	values, ok := fields["1"].([]any)
	if !ok || len(values) != 2 || values[0] != "a" || values[1] != "bc" {
		t.Fatalf("unexpected repeated field: %#v", fields["1"])
	}
}
