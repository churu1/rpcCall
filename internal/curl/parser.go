package curl

import (
	"fmt"
	"regexp"
	"strings"

	"rpccall/internal/models"
)

// ParseCurl parses a curl command string and returns an HttpRequest.
// Supports: curl [options] URL, -X/--request, -H/--header, -d/--data/--data-raw.
// Multiline curl (with \ at end of line) is supported.
func ParseCurl(line string) (*models.HttpRequest, error) {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil, fmt.Errorf("empty curl command")
	}
	// Join continuation lines (backslash followed by newline)
	line = regexp.MustCompile(`\\\s*\n\s*`).ReplaceAllString(line, " ")
	tokens := tokenize(line)
	if len(tokens) == 0 {
		return nil, fmt.Errorf("empty curl command")
	}
	// Skip leading "curl" or "curl.exe"
	i := 0
	if strings.EqualFold(tokens[0], "curl") {
		i = 1
	} else if strings.HasPrefix(strings.ToLower(tokens[0]), "curl") {
		i = 1
	}

	req := &models.HttpRequest{
		Method:     "GET",
		Headers:    []models.MetadataEntry{},
		Body:       "",
		TimeoutSec: 30,
	}
	var url string

	for i < len(tokens) {
		t := tokens[i]
		switch {
		case t == "-X" || t == "--request":
			i++
			if i < len(tokens) {
				req.Method = strings.ToUpper(tokens[i])
			}
			i++
		case t == "-H" || t == "--header":
			i++
			if i < len(tokens) {
				key, val := parseHeader(tokens[i])
				if key != "" {
					req.Headers = append(req.Headers, models.MetadataEntry{Key: key, Value: val})
				}
			}
			i++
		case t == "-d" || t == "--data" || t == "--data-raw":
			i++
			if i < len(tokens) {
				req.Body = tokens[i]
				if req.Method == "GET" {
					req.Method = "POST"
				}
			}
			i++
		case t == "--data-binary" || t == "--data-ascii":
			i++
			if i < len(tokens) {
				req.Body = tokens[i]
				if req.Method == "GET" {
					req.Method = "POST"
				}
			}
			i++
		case strings.HasPrefix(t, "http://") || strings.HasPrefix(t, "https://"):
			url = t
			i++
		default:
			i++
		}
	}

	if url == "" {
		return nil, fmt.Errorf("no URL found in curl command")
	}
	req.URL = url
	return req, nil
}

// tokenize splits the line by spaces but keeps quoted strings (single or double) as one token.
func tokenize(line string) []string {
	var tokens []string
	var buf strings.Builder
	inQuote := false
	var quote byte
	i := 0
	for i < len(line) {
		c := line[i]
		if inQuote {
			if c == quote && (i == 0 || line[i-1] != '\\') {
				inQuote = false
				quote = 0
				tokens = append(tokens, buf.String())
				buf.Reset()
			} else {
				buf.WriteByte(c)
			}
			i++
			continue
		}
		switch c {
		case ' ', '\t':
			if buf.Len() > 0 {
				tokens = append(tokens, buf.String())
				buf.Reset()
			}
			i++
		case '"', '\'':
			if buf.Len() > 0 {
				tokens = append(tokens, buf.String())
				buf.Reset()
			}
			inQuote = true
			quote = c
			i++
		default:
			buf.WriteByte(c)
			i++
		}
	}
	if inQuote {
		tokens = append(tokens, buf.String())
	} else if buf.Len() > 0 {
		tokens = append(tokens, buf.String())
	}
	return tokens
}

// parseHeader splits "Key: Value" and returns key, value (trimmed).
func parseHeader(s string) (key, value string) {
	idx := strings.Index(s, ":")
	if idx <= 0 {
		return "", ""
	}
	key = strings.TrimSpace(s[:idx])
	value = strings.TrimSpace(s[idx+1:])
	// Remove optional surrounding quotes from value
	if len(value) >= 2 && (value[0] == '"' && value[len(value)-1] == '"' || value[0] == '\'' && value[len(value)-1] == '\'') {
		value = value[1 : len(value)-1]
	}
	return key, value
}

// IsCurl returns true if the string looks like a curl command.
var curlPrefix = regexp.MustCompile(`^\s*curl\s`)

func IsCurl(s string) bool {
	return curlPrefix.MatchString(strings.TrimSpace(s))
}
