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
		Name:    "uid-1",
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
	if created.ID == 0 || !created.Enabled || created.Name != "uid-1" {
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
	if disabled != nil {
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

func TestMetadataProfileLimitAndSingleActive(t *testing.T) {
	s := newTestStore(t)
	defer s.Close()

	for i := 0; i < 10; i++ {
		_, err := s.SaveMetadataProfile(MetadataProfile{
			Address: "example.com:443",
			Name:    string(rune('a' + i)),
			Metadata: []models.MetadataEntry{
				{Key: "uid", Value: string(rune('0' + i))},
			},
			Enabled: i == 0,
		})
		if err != nil {
			t.Fatalf("save profile %d: %v", i, err)
		}
	}
	if _, err := s.SaveMetadataProfile(MetadataProfile{
		Address:  "example.com:443",
		Name:     "overflow",
		Metadata: []models.MetadataEntry{{Key: "uid", Value: "overflow"}},
	}); err == nil {
		t.Fatal("expected profile limit error")
	}

	profiles, err := s.ListMetadataProfilesByAddress("example.com:443")
	if err != nil {
		t.Fatalf("list profiles: %v", err)
	}
	if len(profiles) != 10 {
		t.Fatalf("expected 10 profiles, got %d", len(profiles))
	}
	if err := s.SetMetadataProfileEnabledByID(profiles[3].ID, true); err != nil {
		t.Fatalf("enable profile: %v", err)
	}
	profiles, _ = s.ListMetadataProfilesByAddress("example.com:443")
	active := 0
	for _, profile := range profiles {
		if profile.Enabled {
			active++
		}
	}
	if active != 1 {
		t.Fatalf("expected exactly one active profile, got %d", active)
	}
}
