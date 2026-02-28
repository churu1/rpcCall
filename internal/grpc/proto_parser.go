package grpc

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/desc/protoparse"
	"rpccall/internal/logger"
	"rpccall/internal/models"
)

type ProtoParser struct {
	fileDescriptors map[string][]*desc.FileDescriptor
}

func NewProtoParser() *ProtoParser {
	return &ProtoParser{
		fileDescriptors: make(map[string][]*desc.FileDescriptor),
	}
}

func (p *ProtoParser) ParseFiles(filePaths []string, importPaths []string) ([]models.ProtoFile, error) {
	if len(filePaths) == 0 {
		return nil, fmt.Errorf("no proto files specified")
	}

	importSet := make(map[string]bool)
	addPath := func(p string) {
		abs, _ := filepath.Abs(p)
		importSet[abs] = true
	}

	// Collect primary directories (from explicit import paths and file locations)
	var primaryDirs []string
	for _, ip := range importPaths {
		abs, _ := filepath.Abs(ip)
		primaryDirs = append(primaryDirs, abs)
		addPath(ip)
	}
	for _, fp := range filePaths {
		addPath(filepath.Dir(fp))
	}

	// Add sibling directories of primary dirs only (not parent dirs)
	// to resolve cross-directory imports like proto_inner/ importing from proto/
	for _, dir := range primaryDirs {
		parent := filepath.Dir(dir)
		entries, err := os.ReadDir(parent)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
				addPath(filepath.Join(parent, e.Name()))
			}
		}
	}

	var finalImportPaths []string
	for p := range importSet {
		finalImportPaths = append(finalImportPaths, p)
	}
	// Sort by path depth descending so most specific paths come first
	// (avoids resolving proto_inner/foo.proto as "proto_inner/foo.proto" via parent)
	sort.Slice(finalImportPaths, func(i, j int) bool {
		return strings.Count(finalImportPaths[i], string(filepath.Separator)) >
			strings.Count(finalImportPaths[j], string(filepath.Separator))
	})

	logger.Info("import paths: %v", finalImportPaths)

	// Build a file search index: scan all import path directories recursively
	// to find .proto files, so we can resolve imports like "common.proto"
	fileIndex := buildFileIndex(finalImportPaths)
	logger.Info("indexed %d proto files for import resolution", len(fileIndex))

	// Compute relative names for each input file
	relNames := make([]string, len(filePaths))
	for i, fp := range filePaths {
		absPath, _ := filepath.Abs(fp)
		found := false
		for _, ip := range finalImportPaths {
			rel, err := filepath.Rel(ip, absPath)
			if err == nil && !strings.HasPrefix(rel, "..") {
				relNames[i] = rel
				found = true
				break
			}
		}
		if !found {
			relNames[i] = filepath.Base(fp)
		}
	}

	logger.Info("parsing files: %v", relNames)

	parser := protoparse.Parser{
		ImportPaths:           finalImportPaths,
		IncludeSourceCodeInfo: true,
		Accessor: func(filename string) (io.ReadCloser, error) {
			// google/protobuf well-known types: defer to built-in descriptors
			// regardless of whether the path is absolute or relative
			if strings.Contains(filename, "google/protobuf/") {
				return nil, os.ErrNotExist
			}
			// Absolute path: try opening directly
			if filepath.IsAbs(filename) {
				if f, err := os.Open(filename); err == nil {
					return f, nil
				}
				// Absolute path didn't exist — extract basename and fall through
				filename = filepath.Base(filename)
			}
			// Standard resolution against import paths
			for _, ip := range finalImportPaths {
				full := filepath.Join(ip, filename)
				if f, err := os.Open(full); err == nil {
					return f, nil
				}
			}
			// Look up by basename in file index
			base := filepath.Base(filename)
			if fullPath, ok := fileIndex[base]; ok {
				logger.Info("resolved import %q via index -> %s", filename, fullPath)
				return os.Open(fullPath)
			}
			// Suffix match (e.g. "subdir/common.proto")
			for _, fullPath := range fileIndex {
				if strings.HasSuffix(fullPath, string(filepath.Separator)+filename) {
					logger.Info("resolved import %q via suffix match -> %s", filename, fullPath)
					return os.Open(fullPath)
				}
			}
			logger.Error("cannot resolve import: %q", filename)
			return nil, fmt.Errorf("file not found: %s", filename)
		},
	}

	fds, err := parser.ParseFiles(relNames...)
	if err != nil {
		return nil, fmt.Errorf("proto parse error: %w", err)
	}

	var result []models.ProtoFile
	for i, fd := range fds {
		protoFile := models.ProtoFile{
			Path:     filePaths[i],
			Services: extractServices(fd),
		}
		p.fileDescriptors[filePaths[i]] = []*desc.FileDescriptor{fd}
		logger.Info("parsed %s: %d services", filePaths[i], len(protoFile.Services))
		result = append(result, protoFile)
	}

	return result, nil
}

// buildFileIndex recursively scans directories for .proto files
// and returns a map of basename -> absolute path
func buildFileIndex(dirs []string) map[string]string {
	index := make(map[string]string)
	visited := make(map[string]bool)
	for _, dir := range dirs {
		filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			absPath, _ := filepath.Abs(path)
			if visited[absPath] {
				return nil
			}
			visited[absPath] = true
			if !info.IsDir() && filepath.Ext(path) == ".proto" {
				base := filepath.Base(path)
				// Only store the first found match per basename
				if _, exists := index[base]; !exists {
					index[base] = absPath
				}
			}
			return nil
		})
	}
	return index
}

func (p *ProtoParser) ParseDirectory(dir string) ([]models.ProtoFile, error) {
	var protoFiles []string
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && filepath.Ext(path) == ".proto" {
			protoFiles = append(protoFiles, path)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to walk directory: %w", err)
	}
	if len(protoFiles) == 0 {
		return nil, fmt.Errorf("no .proto files found in %s", dir)
	}

	// Try parsing all files at once first
	result, err := p.ParseFiles(protoFiles, []string{dir})
	if err == nil {
		return result, nil
	}
	logger.Info("batch parse failed (%v), falling back to individual file parsing", err)

	// Fallback: parse files individually, skip failures
	var allResults []models.ProtoFile
	var skipped int
	for _, fp := range protoFiles {
		files, parseErr := p.ParseFiles([]string{fp}, []string{dir})
		if parseErr != nil {
			skipped++
			logger.Info("skipping %s: %v", filepath.Base(fp), parseErr)
			continue
		}
		allResults = append(allResults, files...)
	}
	if len(allResults) == 0 {
		return nil, fmt.Errorf("all %d proto files failed to parse; last error: %w", len(protoFiles), err)
	}
	logger.Info("parsed %d/%d files (%d skipped)", len(allResults), len(protoFiles), skipped)
	return allResults, nil
}

func (p *ProtoParser) GetFileDescriptors(path string) []*desc.FileDescriptor {
	return p.fileDescriptors[path]
}

func (p *ProtoParser) GetAllFileDescriptors() []*desc.FileDescriptor {
	var all []*desc.FileDescriptor
	for _, fds := range p.fileDescriptors {
		all = append(all, fds...)
	}
	return all
}

func extractServices(fd *desc.FileDescriptor) []models.ServiceDefinition {
	var services []models.ServiceDefinition
	for _, svc := range fd.GetServices() {
		sd := models.ServiceDefinition{
			Name:     svc.GetName(),
			FullName: svc.GetFullyQualifiedName(),
		}
		for _, method := range svc.GetMethods() {
			mt := models.MethodTypeUnary
			if method.IsClientStreaming() && method.IsServerStreaming() {
				mt = models.MethodTypeBidiStreaming
			} else if method.IsServerStreaming() {
				mt = models.MethodTypeServerStreaming
			} else if method.IsClientStreaming() {
				mt = models.MethodTypeClientStreaming
			}
			sd.Methods = append(sd.Methods, models.ServiceMethod{
				ServiceName:    svc.GetName(),
				MethodName:     method.GetName(),
				FullName:       method.GetFullyQualifiedName(),
				MethodType:     mt,
				InputTypeName:  method.GetInputType().GetFullyQualifiedName(),
				OutputTypeName: method.GetOutputType().GetFullyQualifiedName(),
			})
		}
		services = append(services, sd)
	}
	return services
}

func GenerateDefaultJSON(msgDesc *desc.MessageDescriptor) string {
	return generateJSONForMessage(msgDesc, 0, make(map[string]bool))
}

func generateJSONForMessage(md *desc.MessageDescriptor, depth int, visited map[string]bool) string {
	if depth > 5 || visited[md.GetFullyQualifiedName()] {
		return "{}"
	}
	visited[md.GetFullyQualifiedName()] = true
	defer delete(visited, md.GetFullyQualifiedName())

	fields := md.GetFields()
	if len(fields) == 0 {
		return "{}"
	}

	result := "{\n"
	for i, f := range fields {
		indent := ""
		for j := 0; j <= depth; j++ {
			indent += "  "
		}
		result += indent + `"` + f.GetJSONName() + `": `

		val := defaultValueForField(f, depth, visited)
		if f.IsRepeated() && !f.IsMap() {
			val = "[" + val + "]"
		}
		result += val
		if i < len(fields)-1 {
			result += ","
		}
		result += "\n"
	}
	closeIndent := ""
	for j := 0; j < depth; j++ {
		closeIndent += "  "
	}
	result += closeIndent + "}"
	return result
}

func (p *ProtoParser) GetMessageFields(serviceName, methodName string) []models.FieldInfo {
	for _, fd := range p.GetAllFileDescriptors() {
		for _, svc := range fd.GetServices() {
			if svc.GetFullyQualifiedName() == serviceName || svc.GetName() == serviceName {
				for _, md := range svc.GetMethods() {
					if md.GetName() == methodName {
						return extractFields(md.GetInputType())
					}
				}
			}
		}
	}
	return nil
}

func ExtractFieldsFromDesc(msgDesc *desc.MessageDescriptor) []models.FieldInfo {
	return extractFields(msgDesc)
}

func extractFields(msgDesc *desc.MessageDescriptor) []models.FieldInfo {
	if msgDesc == nil {
		return nil
	}
	var fields []models.FieldInfo
	for _, f := range msgDesc.GetFields() {
		fi := models.FieldInfo{
			Name:     f.GetName(),
			TypeName: f.GetType().String(),
			Repeated: f.IsRepeated(),
			MapEntry: f.IsMap(),
		}
		if f.GetMessageType() != nil {
			fi.TypeName = f.GetMessageType().GetName()
		}
		if f.GetEnumType() != nil {
			fi.TypeName = f.GetEnumType().GetName()
		}
		fields = append(fields, fi)
	}
	return fields
}

func defaultValueForField(f *desc.FieldDescriptor, depth int, visited map[string]bool) string {
	switch f.GetType().String() {
	case "TYPE_STRING":
		return `""`
	case "TYPE_BOOL":
		return "false"
	case "TYPE_INT32", "TYPE_INT64", "TYPE_UINT32", "TYPE_UINT64",
		"TYPE_SINT32", "TYPE_SINT64", "TYPE_FIXED32", "TYPE_FIXED64",
		"TYPE_SFIXED32", "TYPE_SFIXED64":
		return "0"
	case "TYPE_FLOAT", "TYPE_DOUBLE":
		return "0.0"
	case "TYPE_BYTES":
		return `""`
	case "TYPE_ENUM":
		vals := f.GetEnumType().GetValues()
		if len(vals) > 0 {
			return `"` + vals[0].GetName() + `"`
		}
		return `""`
	case "TYPE_MESSAGE":
		if f.IsMap() {
			return "{}"
		}
		return generateJSONForMessage(f.GetMessageType(), depth+1, visited)
	default:
		return `""`
	}
}
