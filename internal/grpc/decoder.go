package grpc

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/jhump/protoreflect/desc"
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
	projectID := strings.TrimSpace(req.ProjectID)
	if projectID == "" {
		resp.ErrorCode = "message_not_found"
		resp.Error = "projectId is required"
		resp.ElapsedMs = time.Since(start).Milliseconds()
		return resp
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
		msgDesc = d.parser.FindMessageDescriptor(projectID, msgType, req.ExplicitMessageProtoPath)
		if msgDesc == nil {
			resp.ErrorCode = "message_not_found"
			resp.Error = fmt.Sprintf("message type %s not found", msgType)
			resp.ElapsedMs = time.Since(start).Milliseconds()
			return resp
		}
	} else {
		methodDesc, methodErr := d.resolveMethodDescriptor(projectID, req.ServiceName, req.MethodName)
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
	rawTags, rawTagErr := scanProtobufTopLevelTags(rawBytes)
	if rawTagErr != nil {
		resp.Warnings = append(resp.Warnings, fmt.Sprintf("raw tag scan failed: %v", rawTagErr))
	} else {
		resp.RawTags = rawTags
	}

	codec := newDynamicJSONCodec(collectProjectFiles(d.parser, projectID))
	msg := codec.newMessage(msgDesc)
	if err := msg.Unmarshal(rawBytes); err != nil {
		resp.ErrorCode = "unmarshal_failed"
		resp.Error = err.Error()
		resp.ElapsedMs = time.Since(start).Milliseconds()
		return resp
	}

	jsonBytes, err := codec.marshal(msg)
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

	hits, warnings := d.applyNestedRules(projectID, doc, req.NestedRules, msgDesc, codec)
	resp.NestedHits = hits
	resp.Warnings = append(resp.Warnings, warnings...)
	fillMissingFieldsByDescriptor(doc, msgDesc)

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
					RawTags:          decoded.RawTags,
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

func (d *Decoder) resolveMethodDescriptor(projectID, serviceName, methodName string) (*desc.MethodDescriptor, error) {
	for _, fd := range d.parser.GetAllFileDescriptorsByProject(projectID) {
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
		md := d.parser.FindMessageDescriptor(req.ProjectID, req.ExplicitMessageType, req.ExplicitMessageProtoPath)
		if md == nil {
			return nil, fmt.Errorf("message type %s not found", req.ExplicitMessageType)
		}
		return md, nil
	default:
		return nil, fmt.Errorf("invalid decode target: %s", req.Target)
	}
}

func (d *Decoder) applyNestedRules(projectID string, doc any, rules []models.NestedDecodeRule, rootDesc *desc.MessageDescriptor, codec dynamicJSONCodec) (int, []string) {
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
		md := d.parser.FindMessageDescriptor(projectID, msgType, rule.ProtoPath)
		if md == nil {
			warnings = append(warnings, fmt.Sprintf("nested rule %s: message %s not found", path, msgType))
			continue
		}
		changed, warn := decodeFieldPath(doc, path, rootDesc, md, codec)
		hits += changed
		if warn != "" {
			warnings = append(warnings, warn)
		}
	}
	return hits, warnings
}

func decodeFieldPath(root any, fieldPath string, rootDesc *desc.MessageDescriptor, decodeDesc *desc.MessageDescriptor, codec dynamicJSONCodec) (int, string) {
	rawParts := strings.Split(fieldPath, ".")
	parts := make([]string, 0, len(rawParts))
	for _, p := range rawParts {
		p = strings.TrimSpace(p)
		if p != "" {
			parts = append(parts, p)
		}
	}
	if len(parts) == 0 {
		return 0, ""
	}
	if rootDesc != nil && len(parts) > 1 {
		first := parts[0]
		fullName := rootDesc.GetFullyQualifiedName()
		shortName := rootDesc.GetName()
		lastSeg := fullName
		if i := strings.LastIndex(lastSeg, "."); i >= 0 && i+1 < len(lastSeg) {
			lastSeg = lastSeg[i+1:]
		}
		if strings.EqualFold(first, shortName) || strings.EqualFold(first, fullName) || strings.EqualFold(first, lastSeg) {
			parts = parts[1:]
		}
	}
	if len(parts) == 0 {
		return 0, ""
	}
	changed, warn := decodeFieldPathInner(root, parts, decodeDesc, fieldPath, codec)
	return changed, warn
}

func decodeFieldPathInner(node any, parts []string, md *desc.MessageDescriptor, fieldPath string, codec dynamicJSONCodec) (int, string) {
	if len(parts) == 0 {
		return 0, ""
	}
	switch cur := node.(type) {
	case map[string]any:
		key, next, ok := lookupPathKey(cur, parts[0])
		if !ok {
			return 0, fmt.Sprintf("nested rule %s: field not found", fieldPath)
		}
		if len(parts) == 1 {
			changed, err := decodeNodeValue(next, md, codec)
			if err != nil {
				return 0, fmt.Sprintf("nested rule %s: %v", fieldPath, err)
			}
			if changed != nil {
				cur[key] = changed
				return 1, ""
			}
			return 0, fmt.Sprintf("nested rule %s: field is not decodable string/list", fieldPath)
		}
		return decodeFieldPathInner(next, parts[1:], md, fieldPath, codec)
	case []any:
		total := 0
		for _, item := range cur {
			c, _ := decodeFieldPathInner(item, parts, md, fieldPath, codec)
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

func lookupPathKey(m map[string]any, raw string) (string, any, bool) {
	candidates := []string{raw}
	snake := toSnakeCase(raw)
	if snake != raw {
		candidates = append(candidates, snake)
	}
	camel := toLowerCamelCase(raw)
	if camel != raw {
		candidates = append(candidates, camel)
	}
	for _, k := range candidates {
		if v, ok := m[k]; ok {
			return k, v, true
		}
	}
	return "", nil, false
}

func toSnakeCase(s string) string {
	if s == "" {
		return s
	}
	var b strings.Builder
	b.Grow(len(s) + 8)
	for i, r := range s {
		if r >= 'A' && r <= 'Z' {
			if i > 0 {
				b.WriteByte('_')
			}
			b.WriteByte(byte(r - 'A' + 'a'))
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func toLowerCamelCase(s string) string {
	if s == "" {
		return s
	}
	parts := strings.Split(s, "_")
	if len(parts) == 1 {
		return s
	}
	for i, p := range parts {
		if p == "" {
			continue
		}
		if i == 0 {
			parts[i] = strings.ToLower(p)
		} else {
			parts[i] = strings.ToUpper(p[:1]) + strings.ToLower(p[1:])
		}
	}
	return strings.Join(parts, "")
}

func decodeNodeValue(v any, md *desc.MessageDescriptor, codec dynamicJSONCodec) (any, error) {
	switch t := v.(type) {
	case string:
		return decodeNestedString(t, md, codec)
	case []any:
		var out []any
		changed := false
		for _, item := range t {
			s, ok := item.(string)
			if !ok {
				out = append(out, item)
				continue
			}
			decoded, err := decodeNestedString(s, md, codec)
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

func decodeNestedString(encoded string, md *desc.MessageDescriptor, codec dynamicJSONCodec) (any, error) {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		raw2, err2 := base64.RawStdEncoding.DecodeString(encoded)
		if err2 != nil {
			return nil, err
		}
		raw = raw2
	}
	msg := codec.newMessage(md)
	if err := msg.Unmarshal(raw); err != nil {
		return nil, err
	}
	jsonBytes, err := codec.marshal(msg)
	if err != nil {
		return nil, err
	}
	var doc any
	if err := json.Unmarshal(jsonBytes, &doc); err != nil {
		return nil, err
	}
	return doc, nil
}

type rawProtoUint uint64

func (v rawProtoUint) MarshalJSON() ([]byte, error) {
	if uint64(v) <= 9007199254740991 {
		return json.Marshal(uint64(v))
	}
	return json.Marshal(strconv.FormatUint(uint64(v), 10))
}

type rawProtoMessage struct {
	fields []int32
	values map[int32][]any
}

func (m *rawProtoMessage) add(field int32, value any) {
	if m.values == nil {
		m.values = make(map[int32][]any)
	}
	if _, ok := m.values[field]; !ok {
		m.fields = append(m.fields, field)
	}
	m.values[field] = append(m.values[field], value)
}

func (m rawProtoMessage) MarshalJSON() ([]byte, error) {
	var b strings.Builder
	b.WriteByte('{')
	first := true
	for _, field := range m.fields {
		values := m.values[field]
		if len(values) == 0 {
			continue
		}
		if !first {
			b.WriteByte(',')
		}
		first = false
		b.WriteString(strconv.Quote(strconv.Itoa(int(field))))
		b.WriteByte(':')
		var value any = values[0]
		if len(values) > 1 {
			value = values
		}
		raw, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		b.Write(raw)
	}
	b.WriteByte('}')
	return []byte(b.String()), nil
}

func parseRawProtobuf(b []byte) (rawProtoMessage, error) {
	msg := rawProtoMessage{values: map[int32][]any{}}
	i := 0
	for i < len(b) {
		field, wire, value, next, err := consumeRawProtobufField(b, i)
		if err != nil {
			return msg, err
		}
		if wire == 4 {
			return msg, fmt.Errorf("unexpected end group for field %d", field)
		}
		msg.add(field, value)
		i = next
	}
	return msg, nil
}

func consumeRawProtobufField(b []byte, i int) (int32, int32, any, int, error) {
	tag, n, err := readProtoVarintAt(b, i)
	if err != nil {
		return 0, 0, nil, i, err
	}
	i += n
	field := int32(tag >> 3)
	wire := int32(tag & 0x7)
	if field <= 0 {
		return 0, 0, nil, i, fmt.Errorf("invalid field number 0 at offset %d", i-n)
	}

	switch wire {
	case 0:
		v, n2, err := readProtoVarintAt(b, i)
		if err != nil {
			return 0, 0, nil, i, err
		}
		return field, wire, rawProtoUint(v), i + n2, nil
	case 1:
		if i+8 > len(b) {
			return 0, 0, nil, i, fmt.Errorf("truncated fixed64 at offset %d", i)
		}
		v := binary.LittleEndian.Uint64(b[i : i+8])
		return field, wire, rawProtoUint(v), i + 8, nil
	case 2:
		l, n2, err := readProtoVarintAt(b, i)
		if err != nil {
			return 0, 0, nil, i, err
		}
		i += n2
		if l > uint64(len(b)-i) {
			return 0, 0, nil, i, fmt.Errorf("truncated bytes field at offset %d", i)
		}
		value := rawProtobufBytesValue(b[i : i+int(l)])
		return field, wire, value, i + int(l), nil
	case 3:
		group := rawProtoMessage{values: map[int32][]any{}}
		for i < len(b) {
			groupField, groupWire, groupValue, next, err := consumeRawProtobufField(b, i)
			if err != nil {
				return 0, 0, nil, i, err
			}
			if groupWire == 4 {
				if groupField != field {
					return 0, 0, nil, i, fmt.Errorf("mismatched end group: expected %d got %d", field, groupField)
				}
				return field, wire, group, next, nil
			}
			group.add(groupField, groupValue)
			i = next
		}
		return 0, 0, nil, i, fmt.Errorf("truncated group field %d", field)
	case 4:
		return field, wire, nil, i, nil
	case 5:
		if i+4 > len(b) {
			return 0, 0, nil, i, fmt.Errorf("truncated fixed32 at offset %d", i)
		}
		v := binary.LittleEndian.Uint32(b[i : i+4])
		return field, wire, rawProtoUint(v), i + 4, nil
	default:
		return 0, 0, nil, i, fmt.Errorf("unsupported wire type %d at offset %d", wire, i)
	}
}

func rawProtobufBytesValue(b []byte) any {
	if len(b) == 0 {
		return ""
	}
	if msg, err := parseRawProtobuf(b); err == nil && len(msg.fields) > 0 {
		return msg
	}
	if utf8.Valid(b) {
		return string(b)
	}
	return base64.StdEncoding.EncodeToString(b)
}

func base64ProtobufCandidate(value string) ([]byte, bool) {
	if len(value) < 8 || len(value) > 1<<20 {
		return nil, false
	}
	raw, err := decodeBase64(value)
	if err != nil || len(raw) == 0 {
		return nil, false
	}
	tag, n, err := readProtoVarintAt(raw, 0)
	if err != nil || n <= 0 {
		return nil, false
	}
	field := int32(tag >> 3)
	wire := int32(tag & 0x7)
	if field <= 0 || wire == 4 {
		return nil, false
	}
	return raw, true
}

func DecodeJSONProtobufFields(jsonBody string) string {
	var doc any
	if err := json.Unmarshal([]byte(jsonBody), &doc); err != nil {
		return "{}"
	}
	found := make(map[string]any)
	collectJSONProtobufFields(doc, found, 200)
	out, err := json.Marshal(found)
	if err != nil {
		return "{}"
	}
	return string(out)
}

func collectJSONProtobufFields(node any, out map[string]any, limit int) {
	if len(out) >= limit {
		return
	}
	switch value := node.(type) {
	case string:
		raw, ok := base64ProtobufCandidate(value)
		if !ok {
			return
		}
		msg, err := parseRawProtobuf(raw)
		if err != nil || len(msg.fields) == 0 {
			return
		}
		if _, exists := out[value]; !exists {
			out[value] = msg
		}
	case []any:
		for _, item := range value {
			collectJSONProtobufFields(item, out, limit)
		}
	case map[string]any:
		for _, item := range value {
			collectJSONProtobufFields(item, out, limit)
		}
	}
}

func fillMissingFieldsByDescriptor(node any, md *desc.MessageDescriptor) {
	if md == nil {
		return
	}
	obj, ok := node.(map[string]any)
	if !ok {
		return
	}
	for _, f := range md.GetFields() {
		key := f.GetJSONName()
		if key == "" {
			key = toLowerCamelCase(f.GetName())
		}
		val, exists := obj[key]
		if !exists {
			obj[key] = defaultJSONValueForField(f)
			continue
		}

		if f.GetMessageType() == nil {
			continue
		}

		if f.IsMap() {
			mapObj, ok := val.(map[string]any)
			if !ok {
				continue
			}
			mv := f.GetMapValueType()
			if mv == nil || mv.GetMessageType() == nil {
				continue
			}
			for mk, mval := range mapObj {
				if child, ok := mval.(map[string]any); ok {
					fillMissingFieldsByDescriptor(child, mv.GetMessageType())
					mapObj[mk] = child
				}
			}
			continue
		}

		if f.IsRepeated() {
			arr, ok := val.([]any)
			if !ok {
				continue
			}
			for i, item := range arr {
				if child, ok := item.(map[string]any); ok {
					fillMissingFieldsByDescriptor(child, f.GetMessageType())
					arr[i] = child
				}
			}
			obj[key] = arr
			continue
		}

		if child, ok := val.(map[string]any); ok {
			fillMissingFieldsByDescriptor(child, f.GetMessageType())
			obj[key] = child
		}
	}
}

func defaultJSONValueForField(f *desc.FieldDescriptor) any {
	if f.IsMap() {
		return map[string]any{}
	}
	if f.IsRepeated() {
		return []any{}
	}
	if f.GetMessageType() != nil {
		return nil
	}
	if f.GetEnumType() != nil {
		vals := f.GetEnumType().GetValues()
		if len(vals) > 0 {
			return vals[0].GetName()
		}
		return 0
	}
	switch f.GetType().String() {
	case "TYPE_STRING":
		return ""
	case "TYPE_BOOL":
		return false
	case "TYPE_BYTES":
		return ""
	case "TYPE_FLOAT", "TYPE_DOUBLE":
		return 0.0
	default:
		return 0
	}
}

func scanProtobufTopLevelTags(b []byte) ([]models.DecodeRawTag, error) {
	if len(b) == 0 {
		return nil, nil
	}
	type key struct {
		field int32
		wire  int32
	}
	counts := map[key]int32{}
	i := 0
	for i < len(b) {
		tag, n, err := readProtoVarintAt(b, i)
		if err != nil {
			return nil, err
		}
		i += n
		fieldNum := int32(tag >> 3)
		wireType := int32(tag & 0x7)
		if fieldNum <= 0 {
			return nil, fmt.Errorf("invalid field number 0 at offset %d", i-n)
		}
		counts[key{field: fieldNum, wire: wireType}]++

		next, err := skipWireValue(b, i, wireType)
		if err != nil {
			return nil, err
		}
		i = next
	}

	out := make([]models.DecodeRawTag, 0, len(counts))
	for k, c := range counts {
		out = append(out, models.DecodeRawTag{
			FieldNumber: k.field,
			WireType:    k.wire,
			Count:       c,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].FieldNumber != out[j].FieldNumber {
			return out[i].FieldNumber < out[j].FieldNumber
		}
		return out[i].WireType < out[j].WireType
	})
	return out, nil
}

func skipWireValue(b []byte, idx int, wireType int32) (int, error) {
	switch wireType {
	case 0:
		_, n, err := readProtoVarintAt(b, idx)
		return idx + n, err
	case 1:
		if idx+8 > len(b) {
			return idx, fmt.Errorf("truncated fixed64 at offset %d", idx)
		}
		return idx + 8, nil
	case 2:
		l, n, err := readProtoVarintAt(b, idx)
		if err != nil {
			return idx, err
		}
		start := idx + n
		end := start + int(l)
		if end < start || end > len(b) {
			return idx, fmt.Errorf("truncated bytes field at offset %d", idx)
		}
		return end, nil
	case 5:
		if idx+4 > len(b) {
			return idx, fmt.Errorf("truncated fixed32 at offset %d", idx)
		}
		return idx + 4, nil
	default:
		return idx, fmt.Errorf("unsupported wire type %d at offset %d", wireType, idx)
	}
}

func readProtoVarintAt(b []byte, idx int) (uint64, int, error) {
	var x uint64
	shift := uint(0)
	start := idx
	for idx < len(b) {
		c := b[idx]
		idx++
		x |= uint64(c&0x7f) << shift
		if c < 0x80 {
			return x, idx - start, nil
		}
		shift += 7
		if shift >= 64 {
			return 0, 0, fmt.Errorf("varint overflow at offset %d", start)
		}
	}
	return 0, 0, fmt.Errorf("truncated varint at offset %d", start)
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
		case 'b':
			out = append(out, '\b')
		case 'f':
			out = append(out, '\f')
		case 'a':
			out = append(out, '\a')
		case 'v':
			out = append(out, '\v')
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
