package grpc

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/dynamic"
	"rpccall/internal/models"
)

type Decoder struct {
	parser     *ProtoParser
	reflection *ReflectionClient
}

func NewDecoder(parser *ProtoParser, reflection *ReflectionClient) *Decoder {
	return &Decoder{
		parser:     parser,
		reflection: reflection,
	}
}

func (d *Decoder) DecodePayload(req models.DecodeRequest) *models.DecodeResponse {
	start := time.Now()
	resp := &models.DecodeResponse{
		OK:       false,
		Warnings: []string{},
	}

	var msgDesc *desc.MessageDescriptor
	var err error
	if req.Target == models.DecodeTargetMessage {
		msgType := strings.TrimSpace(req.ExplicitMessageType)
		if msgType == "" {
			resp.ErrorCode = "message_not_found"
			resp.Error = "explicit message type is required when target=message"
			resp.ElapsedMs = time.Since(start).Milliseconds()
			return resp
		}
		msgDesc = d.findMessageDescriptor(msgType)
		if msgDesc == nil {
			resp.ErrorCode = "message_not_found"
			resp.Error = fmt.Sprintf("message type %s not found", msgType)
			resp.ElapsedMs = time.Since(start).Milliseconds()
			return resp
		}
	} else {
		methodDesc, methodErr := d.resolveMethodDescriptor(req.ServiceName, req.MethodName)
		if methodErr != nil {
			resp.ErrorCode = "message_not_found"
			resp.Error = methodErr.Error()
			resp.ElapsedMs = time.Since(start).Milliseconds()
			return resp
		}
		msgDesc, err = d.resolveMessageDescriptor(methodDesc, req)
		if err != nil {
			resp.ErrorCode = "message_not_found"
			resp.Error = err.Error()
			resp.ElapsedMs = time.Since(start).Milliseconds()
			return resp
		}
	}

	rawBytes, detected, parseErr := decodeInputPayload(req.Payload, req.Encoding)
	resp.DetectedEncoding = detected
	if parseErr != nil {
		resp.ErrorCode = parseErr.code
		resp.Error = parseErr.err.Error()
		resp.ElapsedMs = time.Since(start).Milliseconds()
		return resp
	}

	msg := dynamic.NewMessage(msgDesc)
	if err := msg.Unmarshal(rawBytes); err != nil {
		resp.ErrorCode = "unmarshal_failed"
		resp.Error = err.Error()
		resp.ElapsedMs = time.Since(start).Milliseconds()
		return resp
	}

	jsonBytes, err := marshalDynamicMessage(msg)
	if err != nil {
		resp.ErrorCode = "unmarshal_failed"
		resp.Error = err.Error()
		resp.ElapsedMs = time.Since(start).Milliseconds()
		return resp
	}

	var doc any
	if err := json.Unmarshal(jsonBytes, &doc); err != nil {
		resp.ErrorCode = "unmarshal_failed"
		resp.Error = err.Error()
		resp.ElapsedMs = time.Since(start).Milliseconds()
		return resp
	}

	hits, warnings := d.applyNestedRules(doc, req.NestedRules)
	resp.NestedHits = hits
	resp.Warnings = append(resp.Warnings, warnings...)

	finalBytes, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		resp.ErrorCode = "unmarshal_failed"
		resp.Error = err.Error()
		resp.ElapsedMs = time.Since(start).Milliseconds()
		return resp
	}

	resp.OK = true
	resp.JSON = string(finalBytes)
	resp.ElapsedMs = time.Since(start).Milliseconds()
	return resp
}

func (d *Decoder) DecodeBatch(req models.DecodeBatchRequest) *models.DecodeBatchResponse {
	out := &models.DecodeBatchResponse{
		Total:   len(req.Items),
		Results: make([]models.DecodeItemResult, len(req.Items)),
	}
	if len(req.Items) == 0 {
		return out
	}

	workers := runtime.NumCPU()
	if workers > 4 {
		workers = 4
	}
	if workers < 1 {
		workers = 1
	}

	type job struct {
		index   int
		payload string
	}
	jobs := make(chan job, len(req.Items))
	var wg sync.WaitGroup

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				itemReq := req.Common
				itemReq.Payload = j.payload
				decoded := d.DecodePayload(itemReq)

				item := models.DecodeItemResult{
					Index:            j.index,
					OK:               decoded.OK,
					DetectedEncoding: decoded.DetectedEncoding,
					JSON:             decoded.JSON,
					NestedHits:       decoded.NestedHits,
					ErrorCode:        decoded.ErrorCode,
					Error:            decoded.Error,
					Warnings:         decoded.Warnings,
					ElapsedMs:        decoded.ElapsedMs,
				}
				out.Results[j.index] = item
			}
		}()
	}

	for i, payload := range req.Items {
		jobs <- job{index: i, payload: payload}
	}
	close(jobs)
	wg.Wait()

	for _, r := range out.Results {
		if r.OK {
			out.Success++
		} else {
			out.Failed++
		}
	}
	return out
}

func (d *Decoder) resolveMethodDescriptor(serviceName, methodName string) (*desc.MethodDescriptor, error) {
	for _, fd := range d.parser.GetAllFileDescriptors() {
		for _, svc := range fd.GetServices() {
			if svc.GetFullyQualifiedName() == serviceName || svc.GetName() == serviceName {
				for _, md := range svc.GetMethods() {
					if md.GetName() == methodName {
						return md, nil
					}
				}
			}
		}
	}

	if d.reflection != nil {
		if svc := d.reflection.GetServiceDescriptor(serviceName); svc != nil {
			for _, md := range svc.GetMethods() {
				if md.GetName() == methodName {
					return md, nil
				}
			}
		}
		for _, svc := range d.reflection.GetAllServiceDescriptors() {
			if svc.GetName() != serviceName && svc.GetFullyQualifiedName() != serviceName {
				continue
			}
			for _, md := range svc.GetMethods() {
				if md.GetName() == methodName {
					return md, nil
				}
			}
		}
	}
	return nil, fmt.Errorf("method %s/%s not found", serviceName, methodName)
}

func (d *Decoder) resolveMessageDescriptor(method *desc.MethodDescriptor, req models.DecodeRequest) (*desc.MessageDescriptor, error) {
	switch req.Target {
	case models.DecodeTargetInput, "":
		return method.GetInputType(), nil
	case models.DecodeTargetOutput:
		return method.GetOutputType(), nil
	case models.DecodeTargetMessage:
		if strings.TrimSpace(req.ExplicitMessageType) == "" {
			return nil, fmt.Errorf("explicit message type is required when target=message")
		}
		md := d.findMessageDescriptor(req.ExplicitMessageType)
		if md == nil {
			return nil, fmt.Errorf("message type %s not found", req.ExplicitMessageType)
		}
		return md, nil
	default:
		return nil, fmt.Errorf("invalid decode target: %s", req.Target)
	}
}

func (d *Decoder) findMessageDescriptor(messageType string) *desc.MessageDescriptor {
	for _, fd := range d.parser.GetAllFileDescriptors() {
		if md := findMessageInFile(fd, messageType); md != nil {
			return md
		}
	}
	if d.reflection != nil {
		for _, svc := range d.reflection.GetAllServiceDescriptors() {
			fd := svc.GetFile()
			if fd == nil {
				continue
			}
			if md := findMessageInFile(fd, messageType); md != nil {
				return md
			}
		}
	}
	return nil
}

func findMessageInFile(fd *desc.FileDescriptor, messageType string) *desc.MessageDescriptor {
	for _, md := range fd.GetMessageTypes() {
		if hit := findMessageRecursive(md, messageType); hit != nil {
			return hit
		}
	}
	return nil
}

func findMessageRecursive(md *desc.MessageDescriptor, messageType string) *desc.MessageDescriptor {
	if md.GetFullyQualifiedName() == messageType || md.GetName() == messageType {
		return md
	}
	for _, nested := range md.GetNestedMessageTypes() {
		if hit := findMessageRecursive(nested, messageType); hit != nil {
			return hit
		}
	}
	return nil
}

func (d *Decoder) applyNestedRules(doc any, rules []models.NestedDecodeRule) (int, []string) {
	if len(rules) == 0 {
		return 0, nil
	}
	hits := 0
	var warnings []string
	for _, rule := range rules {
		path := strings.TrimSpace(rule.FieldPath)
		msgType := strings.TrimSpace(rule.MessageType)
		if path == "" || msgType == "" {
			continue
		}
		md := d.findMessageDescriptor(msgType)
		if md == nil {
			warnings = append(warnings, fmt.Sprintf("nested rule %s: message %s not found", path, msgType))
			continue
		}
		changed, warn := decodeFieldPath(doc, path, md)
		hits += changed
		if warn != "" {
			warnings = append(warnings, warn)
		}
	}
	return hits, warnings
}

func decodeFieldPath(root any, fieldPath string, md *desc.MessageDescriptor) (int, string) {
	parts := strings.Split(fieldPath, ".")
	if len(parts) == 0 {
		return 0, ""
	}
	changed, warn := decodeFieldPathInner(root, parts, md, fieldPath)
	return changed, warn
}

func decodeFieldPathInner(node any, parts []string, md *desc.MessageDescriptor, fieldPath string) (int, string) {
	if len(parts) == 0 {
		return 0, ""
	}
	switch cur := node.(type) {
	case map[string]any:
		next, ok := cur[parts[0]]
		if !ok {
			return 0, fmt.Sprintf("nested rule %s: field not found", fieldPath)
		}
		if len(parts) == 1 {
			changed, err := decodeNodeValue(next, md)
			if err != nil {
				return 0, fmt.Sprintf("nested rule %s: %v", fieldPath, err)
			}
			if changed != nil {
				cur[parts[0]] = changed
				return 1, ""
			}
			return 0, fmt.Sprintf("nested rule %s: field is not decodable string/list", fieldPath)
		}
		return decodeFieldPathInner(next, parts[1:], md, fieldPath)
	case []any:
		total := 0
		for _, item := range cur {
			c, _ := decodeFieldPathInner(item, parts, md, fieldPath)
			total += c
		}
		if total == 0 {
			return 0, fmt.Sprintf("nested rule %s: field not found in list items", fieldPath)
		}
		return total, ""
	default:
		return 0, fmt.Sprintf("nested rule %s: unexpected field type", fieldPath)
	}
}

func decodeNodeValue(v any, md *desc.MessageDescriptor) (any, error) {
	switch t := v.(type) {
	case string:
		return decodeNestedString(t, md)
	case []any:
		var out []any
		changed := false
		for _, item := range t {
			s, ok := item.(string)
			if !ok {
				out = append(out, item)
				continue
			}
			decoded, err := decodeNestedString(s, md)
			if err != nil {
				out = append(out, item)
				continue
			}
			out = append(out, decoded)
			changed = true
		}
		if !changed {
			return nil, nil
		}
		return out, nil
	default:
		return nil, nil
	}
}

func decodeNestedString(encoded string, md *desc.MessageDescriptor) (any, error) {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		raw2, err2 := base64.RawStdEncoding.DecodeString(encoded)
		if err2 != nil {
			return nil, err
		}
		raw = raw2
	}
	msg := dynamic.NewMessage(md)
	if err := msg.Unmarshal(raw); err != nil {
		return nil, err
	}
	jsonBytes, err := marshalDynamicMessage(msg)
	if err != nil {
		return nil, err
	}
	var doc any
	if err := json.Unmarshal(jsonBytes, &doc); err != nil {
		return nil, err
	}
	return doc, nil
}

type decodeInputError struct {
	code string
	err  error
}

func decodeInputPayload(payload string, encoding models.DecodeEncoding) ([]byte, models.DecodeEncoding, *decodeInputError) {
	switch encoding {
	case models.DecodeEncodingHex:
		b, err := decodeHex(payload)
		if err != nil {
			return nil, models.DecodeEncodingHex, &decodeInputError{code: "invalid_payload_encoding", err: err}
		}
		return b, models.DecodeEncodingHex, nil
	case models.DecodeEncodingBase64:
		b, err := decodeBase64(payload)
		if err != nil {
			return nil, models.DecodeEncodingBase64, &decodeInputError{code: "invalid_payload_encoding", err: err}
		}
		return b, models.DecodeEncodingBase64, nil
	case models.DecodeEncodingEscape:
		b, err := decodeEscape(payload)
		if err != nil {
			return nil, models.DecodeEncodingEscape, &decodeInputError{code: "invalid_payload_encoding", err: err}
		}
		return b, models.DecodeEncodingEscape, nil
	case models.DecodeEncodingRaw:
		b, detected, err := decodeRaw(payload)
		if err != nil {
			return nil, detected, &decodeInputError{code: "file_read_failed", err: err}
		}
		return b, detected, nil
	case models.DecodeEncodingAuto, "":
		return decodeAuto(payload)
	default:
		return nil, encoding, &decodeInputError{code: "invalid_payload_encoding", err: fmt.Errorf("unsupported encoding: %s", encoding)}
	}
}

func decodeAuto(payload string) ([]byte, models.DecodeEncoding, *decodeInputError) {
	if looksLikeEscape(payload) {
		if b, err := decodeEscape(payload); err == nil {
			return b, models.DecodeEncodingEscape, nil
		}
	}
	if b, ok, err := decodeRawFile(payload); ok {
		if err != nil {
			return nil, models.DecodeEncodingRaw, &decodeInputError{code: "file_read_failed", err: err}
		}
		return b, models.DecodeEncodingRaw, nil
	}
	if b, err := decodeHex(payload); err == nil {
		return b, models.DecodeEncodingHex, nil
	}
	if b, err := decodeBase64(payload); err == nil {
		return b, models.DecodeEncodingBase64, nil
	}
	return []byte(payload), models.DecodeEncodingRaw, nil
}

func decodeRaw(payload string) ([]byte, models.DecodeEncoding, error) {
	if b, ok, err := decodeRawFile(payload); ok {
		if err != nil {
			return nil, models.DecodeEncodingRaw, err
		}
		return b, models.DecodeEncodingRaw, nil
	}
	return []byte(payload), models.DecodeEncodingRaw, nil
}

func decodeRawFile(payload string) ([]byte, bool, error) {
	trimmed := strings.TrimSpace(payload)
	if trimmed == "" {
		return nil, false, nil
	}
	if fi, err := os.Stat(trimmed); err == nil && !fi.IsDir() {
		b, readErr := os.ReadFile(trimmed)
		if readErr != nil {
			return nil, true, readErr
		}
		return b, true, nil
	}
	return nil, false, nil
}

func decodeHex(payload string) ([]byte, error) {
	clean := strings.TrimSpace(payload)
	clean = strings.ReplaceAll(clean, "0x", "")
	clean = strings.ReplaceAll(clean, " ", "")
	clean = strings.ReplaceAll(clean, "\n", "")
	clean = strings.ReplaceAll(clean, "\t", "")
	if clean == "" {
		return nil, fmt.Errorf("empty payload")
	}
	hexPattern := regexp.MustCompile(`^[0-9a-fA-F]+$`)
	if !hexPattern.MatchString(clean) {
		return nil, fmt.Errorf("payload is not valid hex")
	}
	if len(clean)%2 != 0 {
		return nil, fmt.Errorf("hex payload length must be even")
	}
	out := make([]byte, len(clean)/2)
	for i := 0; i < len(clean); i += 2 {
		v, err := strconv.ParseUint(clean[i:i+2], 16, 8)
		if err != nil {
			return nil, err
		}
		out[i/2] = byte(v)
	}
	return out, nil
}

func decodeBase64(payload string) ([]byte, error) {
	clean := strings.TrimSpace(payload)
	if clean == "" {
		return nil, fmt.Errorf("empty payload")
	}
	if b, err := base64.StdEncoding.DecodeString(clean); err == nil {
		return b, nil
	}
	return base64.RawStdEncoding.DecodeString(clean)
}

func looksLikeEscape(payload string) bool {
	return strings.Contains(payload, `\x`) || strings.Contains(payload, `\n`) || strings.Contains(payload, `\t`) || regexp.MustCompile(`\\[0-7]{1,3}`).MatchString(payload)
}

func decodeEscape(payload string) ([]byte, error) {
	var out []byte
	for i := 0; i < len(payload); i++ {
		ch := payload[i]
		if ch != '\\' {
			out = append(out, ch)
			continue
		}
		if i+1 >= len(payload) {
			return nil, fmt.Errorf("invalid escape at end")
		}
		i++
		switch payload[i] {
		case 'n':
			out = append(out, '\n')
		case 'r':
			out = append(out, '\r')
		case 't':
			out = append(out, '\t')
		case '\\':
			out = append(out, '\\')
		case '"':
			out = append(out, '"')
		case '\'':
			out = append(out, '\'')
		case 'x':
			if i+2 >= len(payload) {
				return nil, fmt.Errorf("invalid \\x escape")
			}
			v, err := strconv.ParseUint(payload[i+1:i+3], 16, 8)
			if err != nil {
				return nil, fmt.Errorf("invalid \\x escape: %w", err)
			}
			out = append(out, byte(v))
			i += 2
		default:
			if payload[i] >= '0' && payload[i] <= '7' {
				j := i
				for j < len(payload) && j < i+3 && payload[j] >= '0' && payload[j] <= '7' {
					j++
				}
				v, err := strconv.ParseUint(payload[i:j], 8, 8)
				if err != nil {
					return nil, err
				}
				out = append(out, byte(v))
				i = j - 1
			} else {
				out = append(out, payload[i])
			}
		}
	}
	return out, nil
}

func ResolvePathPayloadPath(path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	return abs
}
