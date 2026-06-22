package main

import (
	"testing"

	"rpccall/internal/models"
)

func TestApplyMetadataMappingsFromBody(t *testing.T) {
	body := `{"data":{"token":"abc","uid":42}}`
	mappings := []models.MetadataMapping{
		{Path: "data.token", Key: "authorization", Template: "Bearer {{value}}", Enabled: true},
		{Path: "data.uid", Key: "x-user-id", Template: "{{value}}", Enabled: true},
		{Path: "data.missing", Key: "x-missing", Template: "{{value}}", Enabled: true},
		{Path: "data.token", Key: "x-disabled", Template: "{{value}}", Enabled: false},
	}

	metadata, err := applyMetadataMappingsFromBody(body, mappings)
	if err != nil {
		t.Fatalf("applyMetadataMappingsFromBody returned error: %v", err)
	}
	if len(metadata) != 2 {
		t.Fatalf("expected 2 metadata entries, got %d", len(metadata))
	}
	if metadata[0].Key != "authorization" || metadata[0].Value != "Bearer abc" {
		t.Fatalf("unexpected first metadata entry: %+v", metadata[0])
	}
	if metadata[1].Key != "x-user-id" || metadata[1].Value != "42" {
		t.Fatalf("unexpected second metadata entry: %+v", metadata[1])
	}
}
