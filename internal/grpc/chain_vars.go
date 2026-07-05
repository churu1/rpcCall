package grpc

import (
	"encoding/json"
	"strconv"
	"strings"
)

// ResolvePrevVar resolves a dot-path like "user.id" or "items[0].name"
// against prevResponse (a map[string]interface{} parsed from JSON).
// Returns (value, true) on success, or ("", false) if the path cannot be resolved.
//
// Supported syntax:
//   - dot-separated object keys: "user.profile.name"
//   - array indices: "items[0]", "items[0].name"
//   - mixed: "data.users[2].id"
//
// The final value is rendered as:
//   - string: returned as-is
//   - other types (number, bool, object, array): json.Marshal'd
func ResolvePrevVar(prevResponse interface{}, path string) (string, bool) {
	if prevResponse == nil || path == "" {
		return "", false
	}

	current := prevResponse
	segments := splitVarPath(path)

	for _, seg := range segments {
		if seg == "" {
			return "", false
		}
		// seg may be "key", "[N]", or "key[N]"
		current = stepInto(current, seg)
		if current == nil {
			return "", false
		}
	}

	switch v := current.(type) {
	case string:
		return v, true
	case nil:
		return "", false
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return "", false
		}
		return string(b), true
	}
}

// splitVarPath splits "items[0].name" into ["items[0]", "name"].
// Bracket notation stays attached to its preceding key.
func splitVarPath(path string) []string {
	// First split by '.'
	parts := strings.Split(path, ".")
	// Reconstruct: a token that ends with ']' keeps as-is; tokens like "[0]"
	// that start with '[' should merge with the previous part.
	var result []string
	for _, p := range parts {
		if p == "" {
			continue
		}
		if strings.HasPrefix(p, "[") && len(result) > 0 {
			result[len(result)-1] += p
		} else {
			result = append(result, p)
		}
	}
	return result
}

// stepInto navigates one segment into current.
// A segment may be "key", "[N]", or "key[N]".
func stepInto(current interface{}, seg string) interface{} {
	// Pure array index like "[0]"
	if strings.HasPrefix(seg, "[") && strings.HasSuffix(seg, "]") {
		return indexInto(current, seg)
	}
	// "key[0][1]" - peel off trailing bracket groups, then key
	// We process: key, then any number of [N]
	// Find first '['
	bracketIdx := strings.Index(seg, "[")
	var key string
	rest := seg
	if bracketIdx == -1 {
		key = seg
		rest = ""
	} else {
		key = seg[:bracketIdx]
		rest = seg[bracketIdx:]
	}

	if key != "" {
		m, ok := current.(map[string]interface{})
		if !ok {
			return nil
		}
		v, exists := m[key]
		if !exists {
			return nil
		}
		current = v
	}

	for strings.HasPrefix(rest, "[") {
		end := strings.Index(rest, "]")
		if end == -1 {
			return nil
		}
		idxStr := rest[1:end]
		rest = rest[end+1:]
		current = indexIntoByStr(current, idxStr)
		if current == nil {
			return nil
		}
	}
	return current
}

func indexInto(current interface{}, segWithBrackets string) interface{} {
	// segWithBrackets like "[0]"
	if len(segWithBrackets) < 3 || segWithBrackets[0] != '[' || segWithBrackets[len(segWithBrackets)-1] != ']' {
		return nil
	}
	return indexIntoByStr(current, segWithBrackets[1:len(segWithBrackets)-1])
}

func indexIntoByStr(current interface{}, idxStr string) interface{} {
	n, err := strconv.Atoi(idxStr)
	if err != nil || n < 0 {
		return nil
	}
	arr, ok := current.([]interface{})
	if !ok || n >= len(arr) {
		return nil
	}
	return arr[n]
}
