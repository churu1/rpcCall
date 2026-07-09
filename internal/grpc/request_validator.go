package grpc

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"

	"github.com/jhump/protoreflect/desc"

	"rpccall/internal/models"
)

func (c *Caller) ValidateRequestJSON(req models.GrpcRequest) []models.RequestValidationError {
	methodDesc, err := c.findMethodDescriptor(req.ProjectID, req.ServiceName, req.MethodName)
	if err != nil {
		return []models.RequestValidationError{{
			Line:    1,
			Column:  1,
			Message: err.Error(),
		}}
	}

	decoder := json.NewDecoder(strings.NewReader(req.Body))
	decoder.UseNumber()
	var doc any
	if err := decoder.Decode(&doc); err != nil {
		return []models.RequestValidationError{jsonParseValidationError(req.Body, err)}
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			err = fmt.Errorf("multiple JSON values")
		}
		return []models.RequestValidationError{jsonParseValidationError(req.Body, err)}
	}

	source := newJSONSourceLocator(req.Body)
	var errs []models.RequestValidationError
	validateMessageJSON(doc, methodDesc.GetInputType(), nil, source, &errs)
	if len(errs) > 0 {
		return errs
	}

	codec := c.dynamicCodec(req.ProjectID, methodDesc)
	msg := codec.newMessage(methodDesc.GetInputType())
	if err := codec.unmarshal(msg, []byte(req.Body)); err != nil {
		line, col := source.lineColumn(0)
		return []models.RequestValidationError{{
			Line:     line,
			Column:   col,
			Expected: methodDesc.GetInputType().GetFullyQualifiedName(),
			Actual:   "invalid JSON mapping",
			Message:  fmt.Sprintf("请求 JSON 与 proto 定义不匹配：%v", err),
		}}
	}

	return nil
}

func jsonParseValidationError(body string, err error) models.RequestValidationError {
	locator := newJSONSourceLocator(body)
	line, col := locator.lineColumn(0)
	if syntaxErr, ok := err.(*json.SyntaxError); ok {
		line, col = locator.lineColumn(int(syntaxErr.Offset))
	}
	return models.RequestValidationError{
		Line:     line,
		Column:   col,
		Expected: "valid JSON",
		Actual:   "invalid JSON",
		Message:  fmt.Sprintf("请求体不是合法 JSON：%v", err),
	}
}

func validateMessageJSON(value any, md *desc.MessageDescriptor, path []string, source *jsonSourceLocator, errs *[]models.RequestValidationError) {
	if value == nil {
		return
	}
	if !messageAllowsNonObjectJSON(md) {
		obj, ok := value.(map[string]any)
		if !ok {
			addValidationError(errs, source, path, md.GetFullyQualifiedName(), value, "")
			return
		}
		fields := fieldsByJSONName(md)
		for key, fieldValue := range obj {
			fd := fields[key]
			if fd == nil {
				line, col := source.lineColumnForPath(append(path, key))
				*errs = append(*errs, models.RequestValidationError{
					Path:     pathString(append(path, key)),
					Line:     line,
					Column:   col,
					Expected: "known field",
					Actual:   "unknown field",
					Message:  fmt.Sprintf("未知字段 %s", pathString(append(path, key))),
				})
				continue
			}
			validateFieldJSON(fieldValue, fd, append(path, fd.GetJSONName()), source, errs)
		}
		return
	}
	validateKnownMessageJSON(value, md, path, source, errs)
}

func fieldsByJSONName(md *desc.MessageDescriptor) map[string]*desc.FieldDescriptor {
	fields := make(map[string]*desc.FieldDescriptor, len(md.GetFields())*2)
	for _, fd := range md.GetFields() {
		fields[fd.GetJSONName()] = fd
		fields[fd.GetName()] = fd
	}
	return fields
}

func validateFieldJSON(value any, fd *desc.FieldDescriptor, path []string, source *jsonSourceLocator, errs *[]models.RequestValidationError) {
	if value == nil {
		return
	}
	if fd.IsMap() {
		validateMapJSON(value, fd, path, source, errs)
		return
	}
	if fd.IsRepeated() {
		items, ok := value.([]any)
		if !ok {
			addValidationError(errs, source, path, "array", value, "")
			return
		}
		for i, item := range items {
			validateSingularFieldJSON(item, fd, appendIndex(path, i), source, errs)
		}
		return
	}
	validateSingularFieldJSON(value, fd, path, source, errs)
}

func validateMapJSON(value any, fd *desc.FieldDescriptor, path []string, source *jsonSourceLocator, errs *[]models.RequestValidationError) {
	obj, ok := value.(map[string]any)
	if !ok {
		addValidationError(errs, source, path, "object/map", value, "")
		return
	}
	valueField := mapValueField(fd.GetMessageType())
	if valueField == nil {
		return
	}
	for key, item := range obj {
		validateSingularFieldJSON(item, valueField, append(path, key), source, errs)
	}
}

func mapValueField(md *desc.MessageDescriptor) *desc.FieldDescriptor {
	if md == nil {
		return nil
	}
	for _, fd := range md.GetFields() {
		if fd.GetName() == "value" {
			return fd
		}
	}
	return nil
}

func validateSingularFieldJSON(value any, fd *desc.FieldDescriptor, path []string, source *jsonSourceLocator, errs *[]models.RequestValidationError) {
	if value == nil {
		return
	}
	switch fd.GetType().String() {
	case "TYPE_DOUBLE", "TYPE_FLOAT":
		if !isJSONNumber(value) {
			addValidationError(errs, source, path, "number", value, "")
		}
	case "TYPE_INT32", "TYPE_SINT32", "TYPE_SFIXED32":
		if !isJSONIntegerInRange(value, math.MinInt32, math.MaxInt32) {
			addValidationError(errs, source, path, "int32", value, "")
		}
	case "TYPE_UINT32", "TYPE_FIXED32":
		if !isJSONIntegerInRange(value, 0, math.MaxUint32) {
			addValidationError(errs, source, path, "uint32", value, "")
		}
	case "TYPE_INT64", "TYPE_SINT64", "TYPE_SFIXED64":
		if !isJSONIntegerInRange(value, math.MinInt64, math.MaxInt64) {
			addValidationError(errs, source, path, "int64", value, "")
		}
	case "TYPE_UINT64", "TYPE_FIXED64":
		if !isJSONUnsignedInteger(value) {
			addValidationError(errs, source, path, "uint64", value, "")
		}
	case "TYPE_BOOL":
		if _, ok := value.(bool); !ok {
			addValidationError(errs, source, path, "bool", value, "")
		}
	case "TYPE_STRING", "TYPE_BYTES":
		if _, ok := value.(string); !ok {
			addValidationError(errs, source, path, "string", value, "")
		}
	case "TYPE_ENUM":
		validateEnumJSON(value, fd, path, source, errs)
	case "TYPE_MESSAGE", "TYPE_GROUP":
		validateKnownMessageJSON(value, fd.GetMessageType(), path, source, errs)
	}
}

func validateEnumJSON(value any, fd *desc.FieldDescriptor, path []string, source *jsonSourceLocator, errs *[]models.RequestValidationError) {
	switch v := value.(type) {
	case string:
		for _, ev := range fd.GetEnumType().GetValues() {
			if ev.GetName() == v {
				return
			}
		}
		addValidationError(errs, source, path, "enum "+fd.GetEnumType().GetFullyQualifiedName(), value, "")
	case json.Number:
		if _, err := strconv.ParseInt(v.String(), 10, 32); err != nil {
			addValidationError(errs, source, path, "enum number", value, "")
		}
	default:
		addValidationError(errs, source, path, "enum string or number", value, "")
	}
}

func validateKnownMessageJSON(value any, md *desc.MessageDescriptor, path []string, source *jsonSourceLocator, errs *[]models.RequestValidationError) {
	if md == nil || value == nil {
		return
	}
	switch md.GetFullyQualifiedName() {
	case "google.protobuf.Any":
		obj, ok := value.(map[string]any)
		if !ok {
			addValidationError(errs, source, path, `object with "@type"`, value, "")
			return
		}
		typeValue, ok := obj["@type"].(string)
		if !ok || strings.TrimSpace(typeValue) == "" {
			addValidationError(errs, source, append(path, "@type"), "non-empty type URL string", obj["@type"], "")
		}
	case "google.protobuf.Timestamp", "google.protobuf.Duration",
		"google.protobuf.StringValue", "google.protobuf.BytesValue":
		if _, ok := value.(string); !ok {
			addValidationError(errs, source, path, "string", value, "")
		}
	case "google.protobuf.BoolValue":
		if _, ok := value.(bool); !ok {
			addValidationError(errs, source, path, "bool", value, "")
		}
	case "google.protobuf.DoubleValue", "google.protobuf.FloatValue",
		"google.protobuf.Int32Value", "google.protobuf.UInt32Value":
		if !isJSONNumber(value) {
			addValidationError(errs, source, path, "number", value, "")
		}
	case "google.protobuf.Int64Value":
		if !isJSONIntegerInRange(value, math.MinInt64, math.MaxInt64) {
			addValidationError(errs, source, path, "int64", value, "")
		}
	case "google.protobuf.UInt64Value":
		if !isJSONUnsignedInteger(value) {
			addValidationError(errs, source, path, "uint64", value, "")
		}
	case "google.protobuf.ListValue":
		if _, ok := value.([]any); !ok {
			addValidationError(errs, source, path, "array", value, "")
		}
	case "google.protobuf.Struct", "google.protobuf.Empty":
		if _, ok := value.(map[string]any); !ok {
			addValidationError(errs, source, path, "object", value, "")
		}
	case "google.protobuf.Value":
		return
	default:
		validateMessageJSON(value, md, path, source, errs)
	}
}

func messageAllowsNonObjectJSON(md *desc.MessageDescriptor) bool {
	if md == nil {
		return false
	}
	switch md.GetFullyQualifiedName() {
	case "google.protobuf.Any",
		"google.protobuf.Timestamp",
		"google.protobuf.Duration",
		"google.protobuf.DoubleValue",
		"google.protobuf.FloatValue",
		"google.protobuf.Int64Value",
		"google.protobuf.UInt64Value",
		"google.protobuf.Int32Value",
		"google.protobuf.UInt32Value",
		"google.protobuf.BoolValue",
		"google.protobuf.StringValue",
		"google.protobuf.BytesValue",
		"google.protobuf.Struct",
		"google.protobuf.Value",
		"google.protobuf.ListValue",
		"google.protobuf.Empty":
		return true
	default:
		return false
	}
}

func isJSONNumber(value any) bool {
	switch v := value.(type) {
	case json.Number:
		_, err := strconv.ParseFloat(v.String(), 64)
		return err == nil
	case string:
		_, err := strconv.ParseFloat(v, 64)
		return err == nil
	default:
		return false
	}
}

func isJSONIntegerInRange(value any, min, max int64) bool {
	n, ok := parseJSONInt(value)
	return ok && n >= min && n <= max
}

func isJSONUnsignedInteger(value any) bool {
	switch v := value.(type) {
	case json.Number:
		_, err := strconv.ParseUint(v.String(), 10, 64)
		return err == nil
	case string:
		_, err := strconv.ParseUint(v, 10, 64)
		return err == nil
	default:
		return false
	}
}

func parseJSONInt(value any) (int64, bool) {
	switch v := value.(type) {
	case json.Number:
		n, err := strconv.ParseInt(v.String(), 10, 64)
		return n, err == nil
	case string:
		n, err := strconv.ParseInt(v, 10, 64)
		return n, err == nil
	default:
		return 0, false
	}
}

func addValidationError(errs *[]models.RequestValidationError, source *jsonSourceLocator, path []string, expected string, actualValue any, detail string) {
	line, col := source.lineColumnForPath(path)
	actual := jsonTypeName(actualValue)
	fieldPath := pathString(path)
	message := fmt.Sprintf("%s 类型错误：期望 %s，实际 %s", fieldPath, expected, actual)
	if detail != "" {
		message = detail
	}
	*errs = append(*errs, models.RequestValidationError{
		Path:     fieldPath,
		Line:     line,
		Column:   col,
		Expected: expected,
		Actual:   actual,
		Message:  message,
	})
}

func jsonTypeName(value any) string {
	switch value.(type) {
	case nil:
		return "null"
	case bool:
		return "bool"
	case string:
		return "string"
	case json.Number:
		return "number"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	default:
		return fmt.Sprintf("%T", value)
	}
}

func appendIndex(path []string, index int) []string {
	out := append([]string{}, path...)
	if len(out) == 0 {
		return []string{fmt.Sprintf("[%d]", index)}
	}
	out[len(out)-1] = fmt.Sprintf("%s[%d]", out[len(out)-1], index)
	return out
}

func pathString(path []string) string {
	if len(path) == 0 {
		return "$"
	}
	return strings.Join(path, ".")
}

type jsonSourceLocator struct {
	body []byte
}

func newJSONSourceLocator(body string) *jsonSourceLocator {
	return &jsonSourceLocator{body: []byte(body)}
}

func (l *jsonSourceLocator) lineColumnForPath(path []string) (int, int) {
	offset := l.offsetForPath(path)
	return l.lineColumn(offset)
}

func (l *jsonSourceLocator) offsetForPath(path []string) int {
	searchOffset := 0
	foundOffset := 0
	for _, part := range path {
		key := stripIndex(part)
		if key == "" || strings.HasPrefix(key, "[") {
			continue
		}
		quoted, _ := json.Marshal(key)
		idx := bytes.Index(l.body[searchOffset:], quoted)
		if idx < 0 {
			continue
		}
		foundOffset = searchOffset + idx
		searchOffset = foundOffset + len(quoted)
	}
	return foundOffset
}

func stripIndex(part string) string {
	if i := strings.Index(part, "["); i >= 0 {
		return part[:i]
	}
	return part
}

func (l *jsonSourceLocator) lineColumn(offset int) (int, int) {
	if offset < 0 {
		offset = 0
	}
	if offset > len(l.body) {
		offset = len(l.body)
	}
	line, col := 1, 1
	for i := 0; i < offset; i++ {
		if l.body[i] == '\n' {
			line++
			col = 1
		} else {
			col++
		}
	}
	return line, col
}
