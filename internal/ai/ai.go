package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"rpccall/internal/logger"
	"rpccall/internal/models"
)

type Config struct {
	Endpoint string `json:"endpoint"`
	APIKey   string `json:"apiKey"`
	Model    string `json:"model"`
}

type Client struct {
	configPath string
	config     Config
	httpClient *http.Client
}

func NewClient() (*Client, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = os.TempDir()
	}
	dir := filepath.Join(configDir, "RpcCall")
	os.MkdirAll(dir, 0755)
	configPath := filepath.Join(dir, "ai_config.json")

	c := &Client{
		configPath: configPath,
		httpClient: &http.Client{Timeout: 90 * time.Second},
	}
	c.loadConfig()
	return c, nil
}

func (c *Client) loadConfig() {
	data, err := os.ReadFile(c.configPath)
	if err != nil {
		return
	}
	json.Unmarshal(data, &c.config)
}

func (c *Client) GetConfig() Config {
	return c.config
}

func (c *Client) SaveConfig(cfg Config) error {
	cfg.Endpoint = strings.TrimRight(cfg.Endpoint, "/")
	c.config = cfg
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(c.configPath, data, 0600)
}

func (c *Client) IsConfigured() bool {
	return c.config.APIKey != "" && c.config.Endpoint != ""
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error json.RawMessage `json:"error,omitempty"`
}

func (c *Client) GenerateRequestBody(serviceName, methodName string, fields []models.FieldInfo) (string, error) {
	if !c.IsConfigured() {
		return "", fmt.Errorf("AI not configured")
	}

	fieldsDesc := buildFieldsDescription(fields)

	prompt := fmt.Sprintf(`Generate a valid JSON request body for the gRPC method "%s/%s".

The request message has these fields:
%s

Rules:
- Return ONLY the JSON object, no markdown, no explanation, no code fences.
- Use realistic sample values (e.g. real-looking IDs, names, emails).
- For string fields, infer appropriate values from the field name.
- For number fields, use reasonable positive values.
- For bool fields, use true.
- For repeated fields, include 1-2 example items.
- For map fields, include 1-2 example entries.
- Keep it concise and valid JSON.`, serviceName, methodName, fieldsDesc)

	return c.chat(prompt)
}

func (c *Client) AnalyzeResponse(serviceName, methodName, responseBody, statusCode string) (string, error) {
	if !c.IsConfigured() {
		return "", fmt.Errorf("AI not configured")
	}

	prompt := fmt.Sprintf(`You are a gRPC API expert. Analyze the following gRPC response and provide insights.

Service: %s
Method: %s
Status: %s

Response body:
%s

Please provide a concise analysis in the user's language (Chinese preferred). Include:
1. 响应数据概述：简要说明返回了什么数据
2. 字段解读：解释关键字段的含义和值是否合理
3. 异常检测：标注任何可疑的值（如空值、异常ID、过期时间戳、不合理的数值等）
4. 建议：如有需要改进或注意的地方

Keep the analysis concise and practical. Use bullet points.`, serviceName, methodName, statusCode, truncate(responseBody, 3000))

	return c.chat(prompt)
}

func (c *Client) DiagnoseError(serviceName, methodName, statusCode, errorMessage string, responseTrailers []models.MetadataEntry) (string, error) {
	if !c.IsConfigured() {
		return "", fmt.Errorf("AI not configured")
	}

	trailersStr := ""
	if len(responseTrailers) > 0 {
		var sb strings.Builder
		for _, t := range responseTrailers {
			sb.WriteString(fmt.Sprintf("  %s: %s\n", t.Key, t.Value))
		}
		trailersStr = sb.String()
	}

	prompt := fmt.Sprintf(`You are a gRPC debugging expert. Diagnose the following gRPC call error.

Service: %s
Method: %s
Status Code: %s
Error Message: %s
Trailers:
%s

Please provide a diagnosis in Chinese. Include:
1. 错误原因：解释这个 gRPC 状态码和错误信息的含义
2. 常见触发场景：列出导致此错误的常见原因
3. 排查建议：给出具体的排查步骤
4. 修复方案：提供可能的修复方向

Keep it concise and actionable. Use bullet points.`, serviceName, methodName, statusCode, errorMessage, trailersStr)

	return c.chat(prompt)
}

func buildFieldsDescription(fields []models.FieldInfo) string {
	if len(fields) == 0 {
		return "(no fields defined)"
	}
	var sb strings.Builder
	for _, f := range fields {
		prefix := ""
		if f.Repeated {
			prefix = "repeated "
		}
		if f.MapEntry {
			prefix = "map "
		}
		sb.WriteString(fmt.Sprintf("- %s: %s%s\n", f.Name, prefix, f.TypeName))
	}
	return sb.String()
}

func (c *Client) chat(prompt string) (string, error) {
	model := c.config.Model
	if model == "" {
		model = "gpt-3.5-turbo"
	}

	reqBody := chatRequest{
		Model: model,
		Messages: []chatMessage{
			{Role: "user", Content: prompt},
		},
		Temperature: 0.7,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	endpoint := buildEndpoint(c.config.Endpoint)
	keyMasked := "(empty)"
	if len(c.config.APIKey) > 8 {
		keyMasked = c.config.APIKey[:4] + "***" + c.config.APIKey[len(c.config.APIKey)-4:]
	} else if c.config.APIKey != "" {
		keyMasked = "***"
	}
	logger.Info("AI request: url=%s, model=%s, key=%s", endpoint, model, keyMasked)

	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.config.APIKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		logger.Error("AI response status=%d, body=%s", resp.StatusCode, string(respBytes))
		return "", fmt.Errorf("API returned HTTP %d: %s", resp.StatusCode, truncate(string(respBytes), 200))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBytes, &chatResp); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}

	if len(chatResp.Error) > 0 && string(chatResp.Error) != "null" {
		errMsg := extractErrorMessage(chatResp.Error)
		return "", fmt.Errorf("API error: %s", errMsg)
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("no response from AI")
	}

	content := strings.TrimSpace(chatResp.Choices[0].Message.Content)
	content = stripCodeFences(content)

	if json.Valid([]byte(content)) {
		var buf bytes.Buffer
		json.Indent(&buf, []byte(content), "", "  ")
		return buf.String(), nil
	}

	return content, nil
}

var versionPathRe = regexp.MustCompile(`/v\d+/?$`)

func buildEndpoint(base string) string {
	base = strings.TrimRight(base, "/")
	if versionPathRe.MatchString(base) {
		return base + "/chat/completions"
	}
	return base + "/v1/chat/completions"
}

func extractErrorMessage(raw json.RawMessage) string {
	var errObj struct {
		Message string `json:"message"`
	}
	if json.Unmarshal(raw, &errObj) == nil && errObj.Message != "" {
		return errObj.Message
	}
	var errStr string
	if json.Unmarshal(raw, &errStr) == nil {
		return errStr
	}
	return string(raw)
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func stripCodeFences(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		lines := strings.Split(s, "\n")
		start := 1
		end := len(lines)
		for i := len(lines) - 1; i >= 0; i-- {
			if strings.TrimSpace(lines[i]) == "```" {
				end = i
				break
			}
		}
		if start <= end {
			s = strings.Join(lines[start:end], "\n")
		}
	}
	return strings.TrimSpace(s)
}
