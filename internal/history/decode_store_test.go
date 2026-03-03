package history

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
	"rpccall/internal/models"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := createTables(db); err != nil {
		t.Fatalf("create tables: %v", err)
	}
	return &Store{db: db}
}

func TestDecodeHistoryCRUD(t *testing.T) {
	s := newTestStore(t)
	defer s.Close()

	req := models.DecodeRequest{
		ServiceName: "Echo",
		MethodName:  "Ping",
		Target:      models.DecodeTargetInput,
		Payload:     "0a05616c696365",
		Encoding:    models.DecodeEncodingHex,
		NestedRules: []models.NestedDecodeRule{{FieldPath: "nested", MessageType: "test.pb.Nested"}},
	}
	resp := &models.DecodeResponse{
		OK:               true,
		DetectedEncoding: models.DecodeEncodingHex,
		JSON:             `{"name":"alice"}`,
		Warnings:         []string{"warn"},
		ElapsedMs:        12,
		NestedHits:       1,
	}

	if err := s.SaveDecodeHistory(req, resp); err != nil {
		t.Fatalf("save decode history: %v", err)
	}

	list, err := s.ListDecodeHistory(10)
	if err != nil {
		t.Fatalf("list decode history: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(list))
	}
	if !list[0].Success || list[0].ServiceName != "Echo" {
		t.Fatalf("unexpected entry: %+v", list[0])
	}

	detail, err := s.GetDecodeHistoryDetail(list[0].ID)
	if err != nil {
		t.Fatalf("get detail: %v", err)
	}
	if detail.ResultJSON != resp.JSON || detail.PayloadText != req.Payload {
		t.Fatalf("unexpected detail: %+v", detail)
	}
	if len(detail.NestedRules) != 1 || len(detail.Warnings) != 1 {
		t.Fatalf("nested/warnings not persisted: %+v", detail)
	}

	if err := s.DeleteDecodeHistory(list[0].ID); err != nil {
		t.Fatalf("delete decode history: %v", err)
	}
	list2, err := s.ListDecodeHistory(10)
	if err != nil {
		t.Fatalf("list decode history after delete: %v", err)
	}
	if len(list2) != 0 {
		t.Fatalf("expected empty after delete, got %d", len(list2))
	}

	if err := s.SaveDecodeHistory(req, resp); err != nil {
		t.Fatalf("save decode history 2: %v", err)
	}
	if err := s.ClearDecodeHistory(); err != nil {
		t.Fatalf("clear decode history: %v", err)
	}
	list3, err := s.ListDecodeHistory(10)
	if err != nil {
		t.Fatalf("list decode history after clear: %v", err)
	}
	if len(list3) != 0 {
		t.Fatalf("expected empty after clear, got %d", len(list3))
	}
}

func TestDecodeHistory_PayloadSize(t *testing.T) {
	s := newTestStore(t)
	defer s.Close()

	payload := "hello"
	if err := s.SaveDecodeHistory(
		models.DecodeRequest{
			ServiceName: "S",
			MethodName:  "M",
			Payload:     payload,
			Encoding:    models.DecodeEncodingRaw,
		},
		&models.DecodeResponse{OK: false, ErrorCode: "x", Error: "bad"},
	); err != nil {
		t.Fatalf("save decode history: %v", err)
	}
	list, err := s.ListDecodeHistory(1)
	if err != nil {
		t.Fatalf("list decode history: %v", err)
	}
	if len(list) != 1 || list[0].PayloadSize != len(payload) {
		t.Fatalf("unexpected payload size: %+v", list)
	}
}

func TestMain(m *testing.M) {
	code := m.Run()
	os.Exit(code)
}
