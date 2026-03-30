package history

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
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
		db.Close()
		return nil, err
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
		CREATE TABLE IF NOT EXISTS saved_proto_sources (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			source_type TEXT NOT NULL,
			path TEXT NOT NULL UNIQUE,
			import_paths TEXT NOT NULL DEFAULT '[]',
			created_at TEXT NOT NULL
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
		CREATE TABLE IF NOT EXISTS http_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp TEXT NOT NULL,
			method TEXT NOT NULL,
			url TEXT NOT NULL,
			request_headers TEXT NOT NULL DEFAULT '[]',
			request_body TEXT NOT NULL DEFAULT '',
			response_status_code INTEGER NOT NULL DEFAULT 0,
			response_status TEXT NOT NULL DEFAULT '',
			response_headers TEXT NOT NULL DEFAULT '[]',
			response_body TEXT NOT NULL DEFAULT '',
			elapsed_ms INTEGER NOT NULL DEFAULT 0,
			error_msg TEXT NOT NULL DEFAULT ''
		)
	`)
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
	RequestBody      string              `json:"requestBody"`
	RequestMetadata  []models.MetadataEntry `json:"requestMetadata"`
	ResponseBody     string              `json:"responseBody"`
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

// --- HTTP History ---

func (s *Store) SaveHttp(req models.HttpRequest, resp models.HttpResponse) error {
	reqHeadersJSON, err := json.Marshal(req.Headers)
	if err != nil {
		reqHeadersJSON = []byte("[]")
	}
	respHeadersJSON, err := json.Marshal(resp.Headers)
	if err != nil {
		respHeadersJSON = []byte("[]")
	}
	_, err = s.db.Exec(`
		INSERT INTO http_history (timestamp, method, url, request_headers, request_body,
			response_status_code, response_status, response_headers, response_body, elapsed_ms, error_msg)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		time.Now().Format(time.RFC3339),
		req.Method,
		req.URL,
		string(reqHeadersJSON),
		req.Body,
		resp.StatusCode,
		resp.Status,
		string(respHeadersJSON),
		resp.Body,
		resp.ElapsedMs,
		resp.Error,
	)
	return err
}

type HttpHistoryEntry struct {
	ID         int64  `json:"id"`
	Timestamp  string `json:"timestamp"`
	Method     string `json:"method"`
	URL        string `json:"url"`
	StatusCode int    `json:"statusCode"`
	ElapsedMs  int64  `json:"elapsedMs"`
	Error      string `json:"error,omitempty"`
}

type HttpHistoryDetail struct {
	HttpHistoryEntry
	RequestHeaders  []models.MetadataEntry `json:"requestHeaders"`
	RequestBody     string                `json:"requestBody"`
	ResponseStatus  string               `json:"responseStatus"`
	ResponseHeaders []models.MetadataEntry `json:"responseHeaders"`
	ResponseBody    string                `json:"responseBody"`
}

func (s *Store) ListHttp(limit int) ([]HttpHistoryEntry, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.Query(`
		SELECT id, timestamp, method, url, response_status_code, elapsed_ms, error_msg
		FROM http_history
		ORDER BY id DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []HttpHistoryEntry
	for rows.Next() {
		var e HttpHistoryEntry
		if err := rows.Scan(&e.ID, &e.Timestamp, &e.Method, &e.URL, &e.StatusCode, &e.ElapsedMs, &e.Error); err != nil {
			continue
		}
		entries = append(entries, e)
	}
	return entries, nil
}

func (s *Store) GetHttpDetail(id int64) (*HttpHistoryDetail, error) {
	row := s.db.QueryRow(`
		SELECT id, timestamp, method, url, request_headers, request_body,
			response_status_code, response_status, response_headers, response_body, elapsed_ms, error_msg
		FROM http_history WHERE id = ?
	`, id)
	var d HttpHistoryDetail
	var reqHeaders, respHeaders string
	err := row.Scan(&d.ID, &d.Timestamp, &d.Method, &d.URL, &reqHeaders, &d.RequestBody,
		&d.StatusCode, &d.ResponseStatus, &respHeaders, &d.ResponseBody, &d.ElapsedMs, &d.Error)
	if err != nil {
		return nil, err
	}
	json.Unmarshal([]byte(reqHeaders), &d.RequestHeaders)
	json.Unmarshal([]byte(respHeaders), &d.ResponseHeaders)
	return &d, nil
}

func (s *Store) DeleteHttp(id int64) error {
	_, err := s.db.Exec("DELETE FROM http_history WHERE id = ?", id)
	return err
}

func (s *Store) ClearHttpAll() error {
	_, err := s.db.Exec("DELETE FROM http_history")
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
	SourceType  string   `json:"sourceType"`
	Path        string   `json:"path"`
	ImportPaths []string `json:"importPaths"`
	CreatedAt   string   `json:"createdAt"`
}

func (s *Store) SaveProtoSource(sourceType, path string, importPaths []string) (*SavedProtoSource, error) {
	if path == "" {
		return nil, fmt.Errorf("path cannot be empty")
	}
	ipJSON, _ := json.Marshal(importPaths)
	now := time.Now().Format(time.RFC3339)
	result, err := s.db.Exec(`
		INSERT INTO saved_proto_sources (source_type, path, import_paths, created_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(path) DO UPDATE SET source_type = excluded.source_type, import_paths = excluded.import_paths
	`, sourceType, path, string(ipJSON), now)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	if id == 0 {
		row := s.db.QueryRow("SELECT id FROM saved_proto_sources WHERE path = ?", path)
		row.Scan(&id)
	}
	return &SavedProtoSource{ID: id, SourceType: sourceType, Path: path, ImportPaths: importPaths, CreatedAt: now}, nil
}

func (s *Store) ListProtoSources() ([]SavedProtoSource, error) {
	rows, err := s.db.Query(`
		SELECT id, source_type, path, import_paths, created_at
		FROM saved_proto_sources ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sources []SavedProtoSource
	for rows.Next() {
		var src SavedProtoSource
		var ipJSON string
		if err := rows.Scan(&src.ID, &src.SourceType, &src.Path, &ipJSON, &src.CreatedAt); err != nil {
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

func (s *Store) ClearProtoSources() error {
	_, err := s.db.Exec("DELETE FROM saved_proto_sources")
	return err
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
