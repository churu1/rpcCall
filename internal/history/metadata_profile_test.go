package history

import (
	"testing"

	"rpccall/internal/models"
)

func TestMetadataProfileCRUD(t *testing.T) {
	s := newTestStore(t)
	defer s.Close()

	created, err := s.SaveMetadataProfile(MetadataProfile{
		Address: "example.com:443",
		Metadata: []models.MetadataEntry{
			{Key: "authorization", Value: "Bearer abc"},
		},
		Mappings: []models.MetadataMapping{
			{Path: "data.token", Key: "authorization", Template: "Bearer {{value}}", Enabled: true},
		},
		SourceRequest: models.MetadataSourceRequest{
			ProjectID:   "project",
			Address:     "example.com:443",
			ServiceName: "svc.Auth",
			MethodName:  "Login",
			MethodType:  models.MethodTypeUnary,
			Body:        "{}",
		},
		Enabled: true,
	})
	if err != nil {
		t.Fatalf("save metadata profile: %v", err)
	}
	if created.ID == 0 || !created.Enabled {
		t.Fatalf("unexpected created profile: %+v", created)
	}

	loaded, err := s.GetMetadataProfile("example.com:443")
	if err != nil {
		t.Fatalf("get metadata profile: %v", err)
	}
	if loaded == nil || len(loaded.Metadata) != 1 || loaded.Metadata[0].Value != "Bearer abc" {
		t.Fatalf("unexpected loaded profile: %+v", loaded)
	}

	if err := s.SetMetadataProfileEnabled("example.com:443", false); err != nil {
		t.Fatalf("disable metadata profile: %v", err)
	}
	disabled, err := s.GetMetadataProfile("example.com:443")
	if err != nil {
		t.Fatalf("get disabled profile: %v", err)
	}
	if disabled == nil || disabled.Enabled {
		t.Fatalf("expected disabled profile: %+v", disabled)
	}

	if err := s.DeleteMetadataProfile("example.com:443"); err != nil {
		t.Fatalf("delete metadata profile: %v", err)
	}
	deleted, err := s.GetMetadataProfile("example.com:443")
	if err != nil {
		t.Fatalf("get deleted profile: %v", err)
	}
	if deleted != nil {
		t.Fatalf("expected deleted profile, got %+v", deleted)
	}
}
