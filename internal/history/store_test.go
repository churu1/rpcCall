package history

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	if err := createTables(db); err != nil {
		t.Fatalf("create tables: %v", err)
	}

	return &Store{db: db}
}

func TestDefaultAddressPreferenceLifecycle(t *testing.T) {
	store := newTestStore(t)

	initial, err := store.GetDefaultAddress()
	if err != nil {
		t.Fatalf("get initial default address: %v", err)
	}
	if initial != "" {
		t.Fatalf("initial default address = %q, want empty", initial)
	}

	if err := store.SetDefaultAddress(" rpc-test.voicemaker.media:80 "); err != nil {
		t.Fatalf("set default address: %v", err)
	}

	got, err := store.GetDefaultAddress()
	if err != nil {
		t.Fatalf("get default address: %v", err)
	}
	if got != "rpc-test.voicemaker.media:80" {
		t.Fatalf("default address = %q, want trimmed address", got)
	}

	if err := store.SetDefaultAddress("rpc.voicemaker.media:443"); err != nil {
		t.Fatalf("replace default address: %v", err)
	}

	got, err = store.GetDefaultAddress()
	if err != nil {
		t.Fatalf("get replaced default address: %v", err)
	}
	if got != "rpc.voicemaker.media:443" {
		t.Fatalf("default address = %q, want replacement", got)
	}

	if err := store.ClearDefaultAddress(); err != nil {
		t.Fatalf("clear default address: %v", err)
	}

	got, err = store.GetDefaultAddress()
	if err != nil {
		t.Fatalf("get cleared default address: %v", err)
	}
	if got != "" {
		t.Fatalf("cleared default address = %q, want empty", got)
	}
}

func TestSetDefaultAddressRejectsEmptyAddress(t *testing.T) {
	store := newTestStore(t)

	if err := store.SetDefaultAddress("   "); err == nil {
		t.Fatal("set empty default address succeeded, want error")
	}
}
