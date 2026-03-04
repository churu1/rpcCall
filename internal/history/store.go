package history

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"rpccall/internal/models"
)

type Store struct {
	db *sql.DB
}

func NewStore() (*Store, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = os.TempDir()
	}
	dbDir := filepath.Join(configDir, "RpcCall")
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create config dir: %w", err)
	}

	dbPath := filepath.Join(dbDir, "history.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := createTables(db); err != nil {
		// User chose data reset over compatibility migration. If schema is broken
		// (e.g. missing project_id columns in old DB), drop the DB and recreate.
		if strings.Contains(strings.ToLower(err.Error()), "no such column: project_id") {
			_ = db.Close()
			_ = os.Remove(dbPath)
			db, err = sql.Open("sqlite", dbPath)
			if err != nil {
				return nil, fmt.Errorf("failed to reopen database after reset: %w", err)
			}
			if err := createTables(db); err != nil {
				_ = db.Close()
				return nil, err
			}
		} else {
			db.Close()
			return nil, err
		}
	}

	return &Store{db: db}, nil
}

func createTables(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp TEXT NOT NULL,
			address TEXT NOT NULL,
			service_name TEXT NOT NULL,
			method_name TEXT NOT NULL,
			request_body TEXT NOT NULL,
			request_metadata TEXT NOT NULL DEFAULT '[]',
			response_body TEXT NOT NULL DEFAULT '',
			response_headers TEXT NOT NULL DEFAULT '[]',
			response_trailers TEXT NOT NULL DEFAULT '[]',
			status_code TEXT NOT NULL DEFAULT '',
			elapsed_ms INTEGER NOT NULL DEFAULT 0,
			error_msg TEXT NOT NULL DEFAULT ''
		)
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS saved_addresses (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			address TEXT NOT NULL UNIQUE,
			created_at TEXT NOT NULL
		)
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS proto_projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			created_at TEXT NOT NULL
		)
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS saved_proto_sources (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project_id TEXT NOT NULL DEFAULT '',
			source_type TEXT NOT NULL,
			path TEXT NOT NULL UNIQUE,
			import_paths TEXT NOT NULL DEFAULT '[]',
			created_at TEXT NOT NULL,
			FOREIGN KEY (project_id) REFERENCES proto_projects(id) ON DELETE CASCADE
		)
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS environments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			variables TEXT NOT NULL DEFAULT '{}',
			is_active INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL
		)
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS collections (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			created_at TEXT NOT NULL
		)
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS saved_requests (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			collection_id INTEGER NOT NULL DEFAULT 0,
			name TEXT NOT NULL,
			address TEXT NOT NULL DEFAULT '',
			service_name TEXT NOT NULL DEFAULT '',
			method_name TEXT NOT NULL DEFAULT '',
			method_type TEXT NOT NULL DEFAULT 'unary',
			request_body TEXT NOT NULL DEFAULT '{}',
			metadata TEXT NOT NULL DEFAULT '[]',
			use_tls INTEGER NOT NULL DEFAULT 0,
			cert_path TEXT NOT NULL DEFAULT '',
			key_path TEXT NOT NULL DEFAULT '',
			ca_path TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
		)
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS benchmark_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			address TEXT NOT NULL,
			service_name TEXT NOT NULL,
			method_name TEXT NOT NULL,
			config_json TEXT NOT NULL,
			result_json TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS chain_templates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			steps_json TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS decode_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			project_id TEXT NOT NULL DEFAULT '',
			project_name TEXT NOT NULL DEFAULT '',
			service_name TEXT NOT NULL DEFAULT '',
			method_name TEXT NOT NULL DEFAULT '',
			target TEXT NOT NULL DEFAULT 'input',
			message_type TEXT NOT NULL DEFAULT '',
			input_encoding TEXT NOT NULL DEFAULT 'auto',
			detected_encoding TEXT NOT NULL DEFAULT '',
			payload_text TEXT NOT NULL DEFAULT '',
			payload_size INTEGER NOT NULL DEFAULT 0,
			result_json TEXT NOT NULL DEFAULT '',
			success INTEGER NOT NULL DEFAULT 0,
			error_code TEXT NOT NULL DEFAULT '',
			error_msg TEXT NOT NULL DEFAULT '',
			elapsed_ms INTEGER NOT NULL DEFAULT 0,
			nested_hits INTEGER NOT NULL DEFAULT 0,
			nested_rules_json TEXT NOT NULL DEFAULT '[]',
			warnings_json TEXT NOT NULL DEFAULT '[]'
		)
	`)
	if err != nil {
		return err
	}
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS decode_templates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			project_id TEXT NOT NULL DEFAULT '',
			project_name TEXT NOT NULL DEFAULT '',
			name TEXT NOT NULL DEFAULT '',
			message_type TEXT NOT NULL DEFAULT '',
			encoding TEXT NOT NULL DEFAULT 'auto',
			batch_mode INTEGER NOT NULL DEFAULT 0,
			payload_text TEXT NOT NULL DEFAULT '',
			nested_rules_json TEXT NOT NULL DEFAULT '[]'
		)
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_decode_history_created_at ON decode_history(created_at DESC)`)
	if err != nil {
		return err
	}
	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_decode_history_service_method ON decode_history(service_name, method_name)`)
	if err != nil {
		return err
	}
	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_decode_history_project_id ON decode_history(project_id)`)
	if err != nil {
		return err
	}
	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_decode_templates_project_id ON decode_templates(project_id)`)
	if err != nil {
		return err
	}
	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_decode_templates_updated_at ON decode_templates(updated_at DESC)`)
	if err != nil {
		return err
	}
	if err := migrateProtoProjectScope(db); err != nil {
		return err
	}
	return migrateDecodeHistoryProjectScope(db)
}

func migrateProtoProjectScope(db *sql.DB) error {
	if _, err := db.Exec(`ALTER TABLE saved_proto_sources ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`); err != nil {
		if !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
			return err
		}
	}

	var needsLegacy int
	if err := db.QueryRow(`SELECT COUNT(1) FROM saved_proto_sources WHERE project_id = '' OR project_id IS NULL`).Scan(&needsLegacy); err != nil {
		return err
	}
	if needsLegacy > 0 {
		legacyID := "legacy"
		if _, err := db.Exec(`
			INSERT INTO proto_projects (id, name, created_at)
			VALUES (?, ?, ?)
			ON CONFLICT(id) DO NOTHING
		`, legacyID, legacyID, time.Now().Format(time.RFC3339)); err != nil {
			return err
		}
		if _, err := db.Exec(`UPDATE saved_proto_sources SET project_id = ? WHERE project_id = '' OR project_id IS NULL`, legacyID); err != nil {
			return err
		}
	}

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS saved_proto_sources_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project_id TEXT NOT NULL,
			source_type TEXT NOT NULL,
			path TEXT NOT NULL,
			import_paths TEXT NOT NULL DEFAULT '[]',
			created_at TEXT NOT NULL,
			FOREIGN KEY (project_id) REFERENCES proto_projects(id) ON DELETE CASCADE,
			UNIQUE(project_id, path)
		)
	`); err != nil {
		return err
	}

	if _, err := db.Exec(`
		INSERT OR IGNORE INTO saved_proto_sources_new (id, project_id, source_type, path, import_paths, created_at)
		SELECT id, project_id, source_type, path, import_paths, created_at FROM saved_proto_sources
	`); err != nil {
		return err
	}

	if _, err := db.Exec(`DROP TABLE saved_proto_sources`); err != nil {
		return err
	}
	if _, err := db.Exec(`ALTER TABLE saved_proto_sources_new RENAME TO saved_proto_sources`); err != nil {
		return err
	}

	_, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_proto_sources_project_id ON saved_proto_sources(project_id)`)
	return err
}

func migrateDecodeHistoryProjectScope(db *sql.DB) error {
	if _, err := db.Exec(`ALTER TABLE decode_history ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`); err != nil {
		if !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
			return err
		}
	}
	if _, err := db.Exec(`ALTER TABLE decode_history ADD COLUMN project_name TEXT NOT NULL DEFAULT ''`); err != nil {
		if !strings.Contains(strings.ToLower(err.Error()), "duplicate column name") {
			return err
		}
	}
	_, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_decode_history_project_id ON decode_history(project_id)`)
	return err
}

func (s *Store) Save(req models.GrpcRequest, resp models.GrpcResponse) error {
	metadataJSON, err := json.Marshal(req.Metadata)
	if err != nil {
		metadataJSON = []byte("[]")
	}
	headersJSON, err := json.Marshal(resp.Headers)
	if err != nil {
		headersJSON = []byte("[]")
	}
	trailersJSON, err := json.Marshal(resp.Trailers)
	if err != nil {
		trailersJSON = []byte("[]")
	}

	_, err = s.db.Exec(`
		INSERT INTO history (timestamp, address, service_name, method_name,
			request_body, request_metadata, response_body, response_headers,
			response_trailers, status_code, elapsed_ms, error_msg)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		time.Now().Format(time.RFC3339),
		req.Address,
		req.ServiceName,
		req.MethodName,
		req.Body,
		string(metadataJSON),
		resp.Body,
		string(headersJSON),
		string(trailersJSON),
		resp.StatusCode,
		resp.ElapsedMs,
		resp.Error,
	)
	return err
}

type HistoryEntry struct {
	ID          int64  `json:"id"`
	Timestamp   string `json:"timestamp"`
	Address     string `json:"address"`
	ServiceName string `json:"serviceName"`
	MethodName  string `json:"methodName"`
	StatusCode  string `json:"statusCode"`
	ElapsedMs   int64  `json:"elapsedMs"`
	Error       string `json:"error,omitempty"`
}

type HistoryDetail struct {
	HistoryEntry
	RequestBody      string                 `json:"requestBody"`
	RequestMetadata  []models.MetadataEntry `json:"requestMetadata"`
	ResponseBody     string                 `json:"responseBody"`
	ResponseHeaders  []models.MetadataEntry `json:"responseHeaders"`
	ResponseTrailers []models.MetadataEntry `json:"responseTrailers"`
}

func (s *Store) List(limit int) ([]HistoryEntry, error) {
	if limit <= 0 {
		limit = 100
	}

	rows, err := s.db.Query(`
		SELECT id, timestamp, address, service_name, method_name,
			status_code, elapsed_ms, error_msg
		FROM history
		ORDER BY id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []HistoryEntry
	for rows.Next() {
		var e HistoryEntry
		if err := rows.Scan(&e.ID, &e.Timestamp, &e.Address, &e.ServiceName,
			&e.MethodName, &e.StatusCode, &e.ElapsedMs, &e.Error); err != nil {
			continue
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *Store) GetDetail(id int64) (*HistoryDetail, error) {
	row := s.db.QueryRow(`
		SELECT id, timestamp, address, service_name, method_name,
			request_body, request_metadata, response_body, response_headers,
			response_trailers, status_code, elapsed_ms, error_msg
		FROM history WHERE id = ?
	`, id)

	var d HistoryDetail
	var reqMeta, respHeaders, respTrailers string
	err := row.Scan(&d.ID, &d.Timestamp, &d.Address, &d.ServiceName,
		&d.MethodName, &d.RequestBody, &reqMeta, &d.ResponseBody,
		&respHeaders, &respTrailers, &d.StatusCode, &d.ElapsedMs, &d.Error)
	if err != nil {
		return nil, err
	}

	json.Unmarshal([]byte(reqMeta), &d.RequestMetadata)
	json.Unmarshal([]byte(respHeaders), &d.ResponseHeaders)
	json.Unmarshal([]byte(respTrailers), &d.ResponseTrailers)

	return &d, nil
}

func (s *Store) Delete(id int64) error {
	_, err := s.db.Exec("DELETE FROM history WHERE id = ?", id)
	return err
}

func (s *Store) ClearAll() error {
	_, err := s.db.Exec("DELETE FROM history")
	return err
}

// --- Saved Addresses ---

type SavedAddress struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Address   string `json:"address"`
	CreatedAt string `json:"createdAt"`
}

func (s *Store) SaveAddress(name, address string) (*SavedAddress, error) {
	if address == "" {
		return nil, fmt.Errorf("address cannot be empty")
	}
	if name == "" {
		name = address
	}
	now := time.Now().Format(time.RFC3339)
	result, err := s.db.Exec(`
		INSERT INTO saved_addresses (name, address, created_at)
		VALUES (?, ?, ?)
		ON CONFLICT(address) DO UPDATE SET name = excluded.name
	`, name, address, now)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	if id == 0 {
		row := s.db.QueryRow("SELECT id FROM saved_addresses WHERE address = ?", address)
		row.Scan(&id)
	}
	return &SavedAddress{ID: id, Name: name, Address: address, CreatedAt: now}, nil
}

func (s *Store) ListAddresses() ([]SavedAddress, error) {
	rows, err := s.db.Query(`
		SELECT id, name, address, created_at
		FROM saved_addresses ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var addrs []SavedAddress
	for rows.Next() {
		var a SavedAddress
		if err := rows.Scan(&a.ID, &a.Name, &a.Address, &a.CreatedAt); err != nil {
			continue
		}
		addrs = append(addrs, a)
	}
	return addrs, nil
}

func (s *Store) UpdateAddress(id int64, name, address string) error {
	if address == "" {
		return fmt.Errorf("address cannot be empty")
	}
	if name == "" {
		name = address
	}
	_, err := s.db.Exec("UPDATE saved_addresses SET name = ?, address = ? WHERE id = ?", name, address, id)
	return err
}

func (s *Store) DeleteAddress(id int64) error {
	_, err := s.db.Exec("DELETE FROM saved_addresses WHERE id = ?", id)
	return err
}

// --- Saved Proto Sources ---

type SavedProtoSource struct {
	ID          int64    `json:"id"`
	ProjectID   string   `json:"projectId"`
	SourceType  string   `json:"sourceType"`
	Path        string   `json:"path"`
	ImportPaths []string `json:"importPaths"`
	CreatedAt   string   `json:"createdAt"`
}

type ProtoProject struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

func normalizeProjectID(name string) string {
	name = strings.TrimSpace(strings.ToLower(name))
	if name == "" {
		name = "project"
	}
	name = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '-'
	}, name)
	return strings.Trim(name, "-")
}

func (s *Store) ListProtoProjects() ([]ProtoProject, error) {
	rows, err := s.db.Query(`
		SELECT id, name, created_at
		FROM proto_projects
		ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []ProtoProject
	for rows.Next() {
		var p ProtoProject
		if err := rows.Scan(&p.ID, &p.Name, &p.CreatedAt); err != nil {
			continue
		}
		projects = append(projects, p)
	}
	return projects, nil
}

func (s *Store) CreateProtoProject(name string) (*ProtoProject, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("project name cannot be empty")
	}
	baseID := normalizeProjectID(name)
	if baseID == "" {
		baseID = "project"
	}
	id := baseID
	now := time.Now().Format(time.RFC3339)
	for i := 0; i < 100; i++ {
		if i > 0 {
			id = fmt.Sprintf("%s-%d", baseID, i+1)
		}
		_, err := s.db.Exec(`
			INSERT INTO proto_projects (id, name, created_at)
			VALUES (?, ?, ?)
		`, id, name, now)
		if err == nil {
			return &ProtoProject{ID: id, Name: name, CreatedAt: now}, nil
		}
		if !strings.Contains(strings.ToLower(err.Error()), "constraint") {
			return nil, err
		}
	}
	return nil, fmt.Errorf("failed to allocate project id for %s", name)
}

func (s *Store) UpsertProtoProject(id, name string) (*ProtoProject, error) {
	id = strings.TrimSpace(id)
	name = strings.TrimSpace(name)
	if id == "" && name == "" {
		return nil, fmt.Errorf("project id/name cannot both be empty")
	}
	if id == "" {
		return s.CreateProtoProject(name)
	}
	if name == "" {
		name = id
	}

	now := time.Now().Format(time.RFC3339)
	_, err := s.db.Exec(`
		INSERT INTO proto_projects (id, name, created_at)
		VALUES (?, ?, ?)
	`, id, name, now)
	if err == nil {
		return &ProtoProject{ID: id, Name: name, CreatedAt: now}, nil
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") {
		return nil, err
	}

	var existing ProtoProject
	if rowErr := s.db.QueryRow(`
		SELECT id, name, created_at
		FROM proto_projects
		WHERE id = ?
	`, id).Scan(&existing.ID, &existing.Name, &existing.CreatedAt); rowErr == nil {
		return &existing, nil
	}
	if rowErr := s.db.QueryRow(`
		SELECT id, name, created_at
		FROM proto_projects
		WHERE name = ?
	`, name).Scan(&existing.ID, &existing.Name, &existing.CreatedAt); rowErr == nil {
		return &existing, nil
	}
	return nil, err
}

func (s *Store) DeleteProtoProject(projectID string) error {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return fmt.Errorf("project id cannot be empty")
	}
	_, err := s.db.Exec("DELETE FROM proto_projects WHERE id = ?", projectID)
	return err
}

func (s *Store) SaveProtoSource(projectID, sourceType, path string, importPaths []string) (*SavedProtoSource, error) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return nil, fmt.Errorf("project id cannot be empty")
	}
	if path == "" {
		return nil, fmt.Errorf("path cannot be empty")
	}
	ipJSON, _ := json.Marshal(importPaths)
	now := time.Now().Format(time.RFC3339)
	result, err := s.db.Exec(`
		INSERT INTO saved_proto_sources (project_id, source_type, path, import_paths, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(project_id, path) DO UPDATE
		SET project_id = excluded.project_id, source_type = excluded.source_type, import_paths = excluded.import_paths
	`, projectID, sourceType, path, string(ipJSON), now)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	if id == 0 {
		row := s.db.QueryRow("SELECT id FROM saved_proto_sources WHERE path = ? AND project_id = ?", path, projectID)
		row.Scan(&id)
	}
	return &SavedProtoSource{
		ID:          id,
		ProjectID:   projectID,
		SourceType:  sourceType,
		Path:        path,
		ImportPaths: importPaths,
		CreatedAt:   now,
	}, nil
}

func (s *Store) ListProtoSources(projectID string) ([]SavedProtoSource, error) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return nil, fmt.Errorf("project id cannot be empty")
	}
	rows, err := s.db.Query(`
		SELECT id, project_id, source_type, path, import_paths, created_at
		FROM saved_proto_sources
		WHERE project_id = ?
		ORDER BY created_at ASC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sources []SavedProtoSource
	for rows.Next() {
		var src SavedProtoSource
		var ipJSON string
		if err := rows.Scan(&src.ID, &src.ProjectID, &src.SourceType, &src.Path, &ipJSON, &src.CreatedAt); err != nil {
			continue
		}
		json.Unmarshal([]byte(ipJSON), &src.ImportPaths)
		sources = append(sources, src)
	}
	return sources, nil
}

func (s *Store) DeleteProtoSource(id int64) error {
	_, err := s.db.Exec("DELETE FROM saved_proto_sources WHERE id = ?", id)
	return err
}

func (s *Store) ClearProtoSources(projectID string) error {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return fmt.Errorf("project id cannot be empty")
	}
	_, err := s.db.Exec("DELETE FROM saved_proto_sources WHERE project_id = ?", projectID)
	return err
}

func (s *Store) ListAllProtoSources() ([]SavedProtoSource, error) {
	rows, err := s.db.Query(`
		SELECT id, project_id, source_type, path, import_paths, created_at
		FROM saved_proto_sources
		ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sources []SavedProtoSource
	for rows.Next() {
		var src SavedProtoSource
		var ipJSON string
		if err := rows.Scan(&src.ID, &src.ProjectID, &src.SourceType, &src.Path, &ipJSON, &src.CreatedAt); err != nil {
			continue
		}
		json.Unmarshal([]byte(ipJSON), &src.ImportPaths)
		sources = append(sources, src)
	}
	return sources, nil
}

// --- Environments ---

type Environment struct {
	ID        int64             `json:"id"`
	Name      string            `json:"name"`
	Variables map[string]string `json:"variables"`
	IsActive  bool              `json:"isActive"`
	CreatedAt string            `json:"createdAt"`
}

func (s *Store) SaveEnvironment(name string, variables map[string]string) (*Environment, error) {
	if name == "" {
		return nil, fmt.Errorf("environment name cannot be empty")
	}
	varsJSON, _ := json.Marshal(variables)
	now := time.Now().Format(time.RFC3339)
	result, err := s.db.Exec(`INSERT INTO environments (name, variables, created_at) VALUES (?, ?, ?)`, name, string(varsJSON), now)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	return &Environment{ID: id, Name: name, Variables: variables, IsActive: false, CreatedAt: now}, nil
}

func (s *Store) ListEnvironments() ([]Environment, error) {
	rows, err := s.db.Query(`SELECT id, name, variables, is_active, created_at FROM environments ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var envs []Environment
	for rows.Next() {
		var e Environment
		var varsJSON string
		var active int
		if err := rows.Scan(&e.ID, &e.Name, &varsJSON, &active, &e.CreatedAt); err != nil {
			continue
		}
		json.Unmarshal([]byte(varsJSON), &e.Variables)
		e.IsActive = active == 1
		envs = append(envs, e)
	}
	return envs, nil
}

func (s *Store) UpdateEnvironment(id int64, name string, variables map[string]string) error {
	if name == "" {
		return fmt.Errorf("environment name cannot be empty")
	}
	varsJSON, _ := json.Marshal(variables)
	_, err := s.db.Exec(`UPDATE environments SET name = ?, variables = ? WHERE id = ?`, name, string(varsJSON), id)
	return err
}

func (s *Store) DeleteEnvironment(id int64) error {
	_, err := s.db.Exec("DELETE FROM environments WHERE id = ?", id)
	return err
}

func (s *Store) SetActiveEnvironment(id int64) error {
	_, err := s.db.Exec("UPDATE environments SET is_active = 0")
	if err != nil {
		return err
	}
	if id > 0 {
		_, err = s.db.Exec("UPDATE environments SET is_active = 1 WHERE id = ?", id)
	}
	return err
}

func (s *Store) GetActiveEnvironment() (*Environment, error) {
	row := s.db.QueryRow(`SELECT id, name, variables, is_active, created_at FROM environments WHERE is_active = 1`)
	var e Environment
	var varsJSON string
	var active int
	err := row.Scan(&e.ID, &e.Name, &varsJSON, &active, &e.CreatedAt)
	if err != nil {
		return nil, nil
	}
	json.Unmarshal([]byte(varsJSON), &e.Variables)
	e.IsActive = true
	return &e, nil
}

// --- Collections ---

type Collection struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
}

type SavedRequest struct {
	ID           int64  `json:"id"`
	CollectionID int64  `json:"collectionId"`
	Name         string `json:"name"`
	Address      string `json:"address"`
	ServiceName  string `json:"serviceName"`
	MethodName   string `json:"methodName"`
	MethodType   string `json:"methodType"`
	RequestBody  string `json:"requestBody"`
	Metadata     string `json:"metadata"`
	UseTLS       bool   `json:"useTls"`
	CertPath     string `json:"certPath"`
	KeyPath      string `json:"keyPath"`
	CaPath       string `json:"caPath"`
	CreatedAt    string `json:"createdAt"`
}

func (s *Store) SaveCollection(name string) (*Collection, error) {
	if name == "" {
		return nil, fmt.Errorf("collection name cannot be empty")
	}
	now := time.Now().Format(time.RFC3339)
	result, err := s.db.Exec(`INSERT INTO collections (name, created_at) VALUES (?, ?)`, name, now)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	return &Collection{ID: id, Name: name, CreatedAt: now}, nil
}

func (s *Store) ListCollections() ([]Collection, error) {
	rows, err := s.db.Query(`SELECT id, name, created_at FROM collections ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []Collection
	for rows.Next() {
		var c Collection
		if err := rows.Scan(&c.ID, &c.Name, &c.CreatedAt); err != nil {
			continue
		}
		cols = append(cols, c)
	}
	return cols, nil
}

func (s *Store) UpdateCollection(id int64, name string) error {
	_, err := s.db.Exec("UPDATE collections SET name = ? WHERE id = ?", name, id)
	return err
}

func (s *Store) DeleteCollection(id int64) error {
	_, err := s.db.Exec("DELETE FROM saved_requests WHERE collection_id = ?", id)
	if err != nil {
		return err
	}
	_, err = s.db.Exec("DELETE FROM collections WHERE id = ?", id)
	return err
}

func (s *Store) SaveRequest(req SavedRequest) (*SavedRequest, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("request name cannot be empty")
	}
	now := time.Now().Format(time.RFC3339)
	useTLS := 0
	if req.UseTLS {
		useTLS = 1
	}
	result, err := s.db.Exec(`
		INSERT INTO saved_requests (collection_id, name, address, service_name, method_name, method_type, request_body, metadata, use_tls, cert_path, key_path, ca_path, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, req.CollectionID, req.Name, req.Address, req.ServiceName, req.MethodName, req.MethodType, req.RequestBody, req.Metadata, useTLS, req.CertPath, req.KeyPath, req.CaPath, now)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	req.ID = id
	req.CreatedAt = now
	return &req, nil
}

func (s *Store) ListRequests(collectionID int64) ([]SavedRequest, error) {
	rows, err := s.db.Query(`
		SELECT id, collection_id, name, address, service_name, method_name, method_type, request_body, metadata, use_tls, cert_path, key_path, ca_path, created_at
		FROM saved_requests WHERE collection_id = ? ORDER BY created_at ASC
	`, collectionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reqs []SavedRequest
	for rows.Next() {
		var r SavedRequest
		var useTLS int
		if err := rows.Scan(&r.ID, &r.CollectionID, &r.Name, &r.Address, &r.ServiceName, &r.MethodName, &r.MethodType, &r.RequestBody, &r.Metadata, &useTLS, &r.CertPath, &r.KeyPath, &r.CaPath, &r.CreatedAt); err != nil {
			continue
		}
		r.UseTLS = useTLS == 1
		reqs = append(reqs, r)
	}
	return reqs, nil
}

func (s *Store) DeleteRequest(id int64) error {
	_, err := s.db.Exec("DELETE FROM saved_requests WHERE id = ?", id)
	return err
}

func (s *Store) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

// --- Benchmark History ---

type BenchmarkHistoryEntry struct {
	ID          int64                  `json:"id"`
	Address     string                 `json:"address"`
	ServiceName string                 `json:"serviceName"`
	MethodName  string                 `json:"methodName"`
	Config      models.BenchmarkConfig `json:"config"`
	Result      models.BenchmarkResult `json:"result"`
	CreatedAt   string                 `json:"createdAt"`
}

func (s *Store) SaveBenchmarkHistory(address, serviceName, methodName string, config models.BenchmarkConfig, result models.BenchmarkResult) error {
	configJSON, err := json.Marshal(config)
	if err != nil {
		return err
	}
	resultJSON, err := json.Marshal(result)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`
		INSERT INTO benchmark_history (address, service_name, method_name, config_json, result_json)
		VALUES (?, ?, ?, ?, ?)
	`, address, serviceName, methodName, string(configJSON), string(resultJSON))
	return err
}

func (s *Store) ListBenchmarkHistory(limit int) ([]BenchmarkHistoryEntry, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.Query(`
		SELECT id, address, service_name, method_name, config_json, result_json, created_at
		FROM benchmark_history
		ORDER BY id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []BenchmarkHistoryEntry
	for rows.Next() {
		var e BenchmarkHistoryEntry
		var configJSON, resultJSON string
		if err := rows.Scan(&e.ID, &e.Address, &e.ServiceName, &e.MethodName, &configJSON, &resultJSON, &e.CreatedAt); err != nil {
			continue
		}
		json.Unmarshal([]byte(configJSON), &e.Config)
		json.Unmarshal([]byte(resultJSON), &e.Result)
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *Store) DeleteBenchmarkHistory(id int64) error {
	_, err := s.db.Exec("DELETE FROM benchmark_history WHERE id = ?", id)
	return err
}

func (s *Store) ClearBenchmarkHistory() error {
	_, err := s.db.Exec("DELETE FROM benchmark_history")
	return err
}

// --- Chain Templates ---

type ChainTemplate struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	StepsJSON string `json:"stepsJson"`
	CreatedAt string `json:"createdAt"`
}

func (s *Store) SaveChainTemplate(name string, stepsJSON string) (*ChainTemplate, error) {
	result, err := s.db.Exec(
		"INSERT INTO chain_templates (name, steps_json) VALUES (?, ?)",
		name, stepsJSON,
	)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	return &ChainTemplate{ID: id, Name: name, StepsJSON: stepsJSON}, nil
}

func (s *Store) ListChainTemplates() ([]ChainTemplate, error) {
	rows, err := s.db.Query("SELECT id, name, steps_json, created_at FROM chain_templates ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var templates []ChainTemplate
	for rows.Next() {
		var t ChainTemplate
		if err := rows.Scan(&t.ID, &t.Name, &t.StepsJSON, &t.CreatedAt); err != nil {
			continue
		}
		templates = append(templates, t)
	}
	return templates, nil
}

func (s *Store) UpdateChainTemplate(id int64, name string, stepsJSON string) error {
	_, err := s.db.Exec("UPDATE chain_templates SET name = ?, steps_json = ? WHERE id = ?", name, stepsJSON, id)
	return err
}

func (s *Store) DeleteChainTemplate(id int64) error {
	_, err := s.db.Exec("DELETE FROM chain_templates WHERE id = ?", id)
	return err
}

// --- Decode History ---

type DecodeHistoryEntry struct {
	ID               int64  `json:"id"`
	CreatedAt        string `json:"createdAt"`
	ProjectID        string `json:"projectId"`
	ProjectName      string `json:"projectName"`
	ServiceName      string `json:"serviceName"`
	MethodName       string `json:"methodName"`
	Target           string `json:"target"`
	MessageType      string `json:"messageType"`
	InputEncoding    string `json:"inputEncoding"`
	DetectedEncoding string `json:"detectedEncoding"`
	Success          bool   `json:"success"`
	ErrorCode        string `json:"errorCode,omitempty"`
	Error            string `json:"error,omitempty"`
	ElapsedMs        int64  `json:"elapsedMs"`
	PayloadSize      int    `json:"payloadSize"`
	NestedHits       int    `json:"nestedHits"`
}

type DecodeHistoryDetail struct {
	DecodeHistoryEntry
	PayloadText string                    `json:"payloadText"`
	ResultJSON  string                    `json:"resultJson"`
	NestedRules []models.NestedDecodeRule `json:"nestedRules"`
	Warnings    []string                  `json:"warnings"`
}

type DecodeTemplate struct {
	ID          int64                     `json:"id"`
	CreatedAt   string                    `json:"createdAt"`
	UpdatedAt   string                    `json:"updatedAt"`
	ProjectID   string                    `json:"projectId"`
	ProjectName string                    `json:"projectName"`
	Name        string                    `json:"name"`
	MessageType string                    `json:"messageType"`
	Encoding    string                    `json:"encoding"`
	BatchMode   bool                      `json:"batchMode"`
	PayloadText string                    `json:"payloadText"`
	NestedRules []models.NestedDecodeRule `json:"nestedRules"`
}

func (s *Store) SaveDecodeHistory(req models.DecodeRequest, resp *models.DecodeResponse) error {
	if resp == nil {
		return fmt.Errorf("decode response cannot be nil")
	}

	target := string(req.Target)
	if target == "" {
		target = string(models.DecodeTargetInput)
	}
	inputEncoding := string(req.Encoding)
	if inputEncoding == "" {
		inputEncoding = string(models.DecodeEncodingAuto)
	}
	detected := string(resp.DetectedEncoding)
	rulesJSON, _ := json.Marshal(req.NestedRules)
	warningsJSON, _ := json.Marshal(resp.Warnings)
	projectID := strings.TrimSpace(req.ProjectID)
	projectName := ""
	if projectID != "" {
		_ = s.db.QueryRow(`SELECT name FROM proto_projects WHERE id = ?`, projectID).Scan(&projectName)
	}
	if projectName == "" {
		projectName = projectID
	}

	messageType := strings.TrimSpace(req.ExplicitMessageType)
	if messageType == "" && req.ServiceName != "" && req.MethodName != "" {
		messageType = fmt.Sprintf("%s/%s", req.ServiceName, req.MethodName)
	}
	success := 0
	if resp.OK {
		success = 1
	}
	_, err := s.db.Exec(`
		INSERT INTO decode_history (
			project_id, project_name, service_name, method_name, target, message_type, input_encoding, detected_encoding,
			payload_text, payload_size, result_json, success, error_code, error_msg,
			elapsed_ms, nested_hits, nested_rules_json, warnings_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		projectID, projectName, req.ServiceName, req.MethodName, target, messageType, inputEncoding, detected,
		req.Payload, len(req.Payload), resp.JSON, success, resp.ErrorCode, resp.Error,
		resp.ElapsedMs, resp.NestedHits, string(rulesJSON), string(warningsJSON),
	)
	return err
}

func (s *Store) ListDecodeHistory(limit int) ([]DecodeHistoryEntry, error) {
	if limit <= 0 {
		limit = 200
	}
	rows, err := s.db.Query(`
		SELECT id, created_at, project_id, project_name, service_name, method_name, target, message_type,
		       input_encoding, detected_encoding, success, error_code, error_msg,
		       elapsed_ms, payload_size, nested_hits
		FROM decode_history
		ORDER BY id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []DecodeHistoryEntry
	for rows.Next() {
		var e DecodeHistoryEntry
		var success int
		if err := rows.Scan(
			&e.ID, &e.CreatedAt, &e.ProjectID, &e.ProjectName, &e.ServiceName, &e.MethodName, &e.Target, &e.MessageType,
			&e.InputEncoding, &e.DetectedEncoding, &success, &e.ErrorCode, &e.Error,
			&e.ElapsedMs, &e.PayloadSize, &e.NestedHits,
		); err != nil {
			continue
		}
		e.Success = success == 1
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *Store) GetDecodeHistoryDetail(id int64) (*DecodeHistoryDetail, error) {
	row := s.db.QueryRow(`
		SELECT id, created_at, project_id, project_name, service_name, method_name, target, message_type,
		       input_encoding, detected_encoding, success, error_code, error_msg,
		       elapsed_ms, payload_size, nested_hits, payload_text, result_json,
		       nested_rules_json, warnings_json
		FROM decode_history
		WHERE id = ?
	`, id)

	var d DecodeHistoryDetail
	var success int
	var rulesJSON, warningsJSON string
	if err := row.Scan(
		&d.ID, &d.CreatedAt, &d.ProjectID, &d.ProjectName, &d.ServiceName, &d.MethodName, &d.Target, &d.MessageType,
		&d.InputEncoding, &d.DetectedEncoding, &success, &d.ErrorCode, &d.Error,
		&d.ElapsedMs, &d.PayloadSize, &d.NestedHits, &d.PayloadText, &d.ResultJSON,
		&rulesJSON, &warningsJSON,
	); err != nil {
		return nil, err
	}
	d.Success = success == 1
	json.Unmarshal([]byte(rulesJSON), &d.NestedRules)
	json.Unmarshal([]byte(warningsJSON), &d.Warnings)
	return &d, nil
}

func (s *Store) DeleteDecodeHistory(id int64) error {
	_, err := s.db.Exec("DELETE FROM decode_history WHERE id = ?", id)
	return err
}

func (s *Store) ClearDecodeHistory() error {
	_, err := s.db.Exec("DELETE FROM decode_history")
	return err
}

func (s *Store) SaveDecodeTemplate(
	projectID string,
	name string,
	messageType string,
	encoding string,
	batchMode bool,
	payloadText string,
	nestedRules []models.NestedDecodeRule,
) (*DecodeTemplate, error) {
	projectID = strings.TrimSpace(projectID)
	messageType = strings.TrimSpace(messageType)
	if projectID == "" {
		return nil, fmt.Errorf("projectId is required")
	}
	if messageType == "" {
		return nil, fmt.Errorf("messageType is required")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = messageType
	}
	projectName := ""
	_ = s.db.QueryRow(`SELECT name FROM proto_projects WHERE id = ?`, projectID).Scan(&projectName)
	if projectName == "" {
		projectName = projectID
	}
	if strings.TrimSpace(encoding) == "" {
		encoding = string(models.DecodeEncodingAuto)
	}
	rulesJSON, _ := json.Marshal(nestedRules)
	now := time.Now().Format(time.RFC3339)
	batchInt := 0
	if batchMode {
		batchInt = 1
	}
	result, err := s.db.Exec(`
		INSERT INTO decode_templates (
			created_at, updated_at, project_id, project_name, name, message_type, encoding, batch_mode, payload_text, nested_rules_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, now, now, projectID, projectName, name, messageType, encoding, batchInt, payloadText, string(rulesJSON))
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	return &DecodeTemplate{
		ID:          id,
		CreatedAt:   now,
		UpdatedAt:   now,
		ProjectID:   projectID,
		ProjectName: projectName,
		Name:        name,
		MessageType: messageType,
		Encoding:    encoding,
		BatchMode:   batchMode,
		PayloadText: payloadText,
		NestedRules: nestedRules,
	}, nil
}

func (s *Store) ListDecodeTemplates(projectID string, limit int) ([]DecodeTemplate, error) {
	if limit <= 0 {
		limit = 200
	}
	projectID = strings.TrimSpace(projectID)
	var (
		rows *sql.Rows
		err  error
	)
	if projectID == "" {
		rows, err = s.db.Query(`
			SELECT id, created_at, updated_at, project_id, project_name, name, message_type, encoding, batch_mode, payload_text, nested_rules_json
			FROM decode_templates
			ORDER BY updated_at DESC, id DESC
			LIMIT ?
		`, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT id, created_at, updated_at, project_id, project_name, name, message_type, encoding, batch_mode, payload_text, nested_rules_json
			FROM decode_templates
			WHERE project_id = ?
			ORDER BY updated_at DESC, id DESC
			LIMIT ?
		`, projectID, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	templates := make([]DecodeTemplate, 0)
	for rows.Next() {
		var (
			item     DecodeTemplate
			batchInt int
			rulesRaw string
		)
		if err := rows.Scan(
			&item.ID, &item.CreatedAt, &item.UpdatedAt, &item.ProjectID, &item.ProjectName, &item.Name,
			&item.MessageType, &item.Encoding, &batchInt, &item.PayloadText, &rulesRaw,
		); err != nil {
			continue
		}
		item.BatchMode = batchInt == 1
		_ = json.Unmarshal([]byte(rulesRaw), &item.NestedRules)
		templates = append(templates, item)
	}
	return templates, nil
}

func (s *Store) DeleteDecodeTemplate(id int64) error {
	_, err := s.db.Exec("DELETE FROM decode_templates WHERE id = ?", id)
	return err
}
