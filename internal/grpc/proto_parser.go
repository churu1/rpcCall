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

const defaultProjectID = "legacy"

type ProtoParser struct {
	fileDescriptors map[string]map[string][]*desc.FileDescriptor // projectId -> filePath -> descriptors
}

type parseContext struct {
	projectID        string
	filePaths        []string
	relNames         []string
	finalImportPaths []string
	parser           protoparse.Parser
}

func NewProtoParser() *ProtoParser {
	return &ProtoParser{
		fileDescriptors: make(map[string]map[string][]*desc.FileDescriptor),
	}
}

func (p *ProtoParser) ensureProject(projectID string) string {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return defaultProjectID
	}
	if _, ok := p.fileDescriptors[projectID]; !ok {
		p.fileDescriptors[projectID] = make(map[string][]*desc.FileDescriptor)
	}
	return projectID
}

func (p *ProtoParser) ParseFiles(filePaths []string, importPaths []string) ([]models.ProtoFile, error) {
	return p.ParseFilesWithProject(defaultProjectID, filePaths, importPaths)
}

func (p *ProtoParser) ParseDirectory(dir string) ([]models.ProtoFile, error) {
	return p.ParseDirectoryWithProject(defaultProjectID, dir)
}

func (p *ProtoParser) ParseFilesWithProject(projectID string, filePaths []string, importPaths []string) ([]models.ProtoFile, error) {
	projectID = p.ensureProject(projectID)
	if len(filePaths) == 0 {
		return nil, fmt.Errorf("no proto files specified")
	}

	ctx, err := p.buildParseContext(projectID, filePaths, importPaths)
	if err != nil {
		return nil, err
	}
	return p.parseWithContext(projectID, ctx.filePaths, ctx.relNames, ctx.parser)
}

func (p *ProtoParser) buildParseContext(projectID string, filePaths []string, importPaths []string) (*parseContext, error) {
	if len(filePaths) == 0 {
		return nil, fmt.Errorf("no proto files specified")
	}

	importSet := make(map[string]bool)
	addPath := func(path string) {
		abs, _ := filepath.Abs(path)
		importSet[abs] = true
	}

	var primaryDirs []string
	for _, ip := range importPaths {
		abs, _ := filepath.Abs(ip)
		primaryDirs = append(primaryDirs, abs)
		addPath(ip)
	}
	for _, fp := range filePaths {
		addPath(filepath.Dir(fp))
	}

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
	for pth := range importSet {
		finalImportPaths = append(finalImportPaths, pth)
	}
	sort.Slice(finalImportPaths, func(i, j int) bool {
		return strings.Count(finalImportPaths[i], string(filepath.Separator)) >
			strings.Count(finalImportPaths[j], string(filepath.Separator))
	})

	logger.Info("project=%s import paths: %v", projectID, finalImportPaths)
	fileIndex := buildFileIndex(finalImportPaths)
	logger.Info("project=%s indexed %d proto files for import resolution", projectID, len(fileIndex))

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

	// Deduplicate by parser input name. Monorepos may contain multiple copies of
	// the same logical proto path (e.g. google/api/http.proto), which causes
	// duplicate symbol errors in batch parsing.
	seenRel := make(map[string]struct{}, len(relNames))
	filteredRel := make([]string, 0, len(relNames))
	filteredFiles := make([]string, 0, len(filePaths))
	dupeCount := 0
	for i, rel := range relNames {
		if _, exists := seenRel[rel]; exists {
			dupeCount++
			continue
		}
		seenRel[rel] = struct{}{}
		filteredRel = append(filteredRel, rel)
		filteredFiles = append(filteredFiles, filePaths[i])
	}
	if dupeCount > 0 {
		logger.Info("project=%s skipped %d duplicate proto entries by rel path", projectID, dupeCount)
		relNames = filteredRel
		filePaths = filteredFiles
	}

	parser := protoparse.Parser{
		ImportPaths:           finalImportPaths,
		IncludeSourceCodeInfo: true,
		Accessor: func(filename string) (io.ReadCloser, error) {
			if strings.Contains(filename, "google/protobuf/") {
				return nil, os.ErrNotExist
			}
			if filepath.IsAbs(filename) {
				if f, err := os.Open(filename); err == nil {
					return f, nil
				}
				filename = filepath.Base(filename)
			}
			for _, ip := range finalImportPaths {
				full := filepath.Join(ip, filename)
				if f, err := os.Open(full); err == nil {
					return f, nil
				}
			}
			base := filepath.Base(filename)
			if fullPath, ok := fileIndex[base]; ok {
				logger.Info("project=%s resolved import %q via index -> %s", projectID, filename, fullPath)
				return os.Open(fullPath)
			}
			for _, fullPath := range fileIndex {
				if strings.HasSuffix(fullPath, string(filepath.Separator)+filename) {
					logger.Info("project=%s resolved import %q via suffix match -> %s", projectID, filename, fullPath)
					return os.Open(fullPath)
				}
			}
			return nil, fmt.Errorf("file not found: %s", filename)
		},
	}

	return &parseContext{
		projectID:        projectID,
		filePaths:        filePaths,
		relNames:         relNames,
		finalImportPaths: finalImportPaths,
		parser:           parser,
	}, nil
}

func (p *ProtoParser) parseWithContext(projectID string, filePaths []string, relNames []string, parser protoparse.Parser) ([]models.ProtoFile, error) {
	fds, err := parser.ParseFiles(relNames...)
	if err != nil {
		return nil, fmt.Errorf("proto parse error: %w", err)
	}

	var result []models.ProtoFile
	for i, fd := range fds {
		protoFile := models.ProtoFile{
			Path:      filePaths[i],
			ProjectID: projectID,
			Services:  extractServices(fd),
		}
		p.fileDescriptors[projectID][filePaths[i]] = []*desc.FileDescriptor{fd}
		result = append(result, protoFile)
	}

	return result, nil
}

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
				if _, exists := index[base]; !exists {
					index[base] = absPath
				}
			}
			return nil
		})
	}
	return index
}

func (p *ProtoParser) ParseDirectoryWithProject(projectID, dir string) ([]models.ProtoFile, error) {
	projectID = p.ensureProject(projectID)
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

	ctx, ctxErr := p.buildParseContext(projectID, protoFiles, []string{dir})
	if ctxErr != nil {
		return nil, ctxErr
	}

	result, err := p.parseWithContext(projectID, ctx.filePaths, ctx.relNames, ctx.parser)
	if err == nil {
		return result, nil
	}
	logger.Info("project=%s batch parse failed (%v), falling back to individual file parsing", projectID, err)

	var allResults []models.ProtoFile
	skipped := 0
	for i, fp := range ctx.filePaths {
		fds, parseErr := ctx.parser.ParseFiles(ctx.relNames[i])
		if parseErr != nil {
			skipped++
			continue
		}
		for _, fd := range fds {
			p.fileDescriptors[projectID][fp] = []*desc.FileDescriptor{fd}
			allResults = append(allResults, models.ProtoFile{
				Path:      fp,
				ProjectID: projectID,
				Services:  extractServices(fd),
			})
		}
	}
	if len(allResults) == 0 {
		return nil, fmt.Errorf("all %d proto files failed to parse; last error: %w", len(protoFiles), err)
	}
	logger.Info("project=%s parsed %d/%d files (%d skipped)", projectID, len(allResults), len(protoFiles), skipped)
	return allResults, nil
}

func (p *ProtoParser) GetFileDescriptors(path string) []*desc.FileDescriptor {
	return p.GetFileDescriptorsByProject(defaultProjectID, path)
}

func (p *ProtoParser) GetFileDescriptorsByProject(projectID, path string) []*desc.FileDescriptor {
	projectID = p.ensureProject(projectID)
	return p.fileDescriptors[projectID][path]
}

func (p *ProtoParser) GetAllFileDescriptors() []*desc.FileDescriptor {
	return p.GetAllFileDescriptorsByProject(defaultProjectID)
}

func (p *ProtoParser) GetAllFileDescriptorsByProject(projectID string) []*desc.FileDescriptor {
	projectID = p.ensureProject(projectID)
	var all []*desc.FileDescriptor
	for _, fds := range p.fileDescriptors[projectID] {
		all = append(all, fds...)
	}
	return all
}

func (p *ProtoParser) ClearProject(projectID string) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return
	}
	delete(p.fileDescriptors, projectID)
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

func (p *ProtoParser) GetMessageFields(projectID, serviceName, methodName string) []models.FieldInfo {
	for _, fd := range p.GetAllFileDescriptorsByProject(projectID) {
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
			FieldNumber: int32(f.GetNumber()),
			Name:        f.GetName(),
			TypeName:    f.GetType().String(),
			Repeated:    f.IsRepeated(),
			MapEntry:    f.IsMap(),
		}
		if f.GetMessageType() != nil {
			fi.TypeName = f.GetMessageType().GetFullyQualifiedName()
		}
		if f.GetEnumType() != nil {
			fi.TypeName = f.GetEnumType().GetFullyQualifiedName()
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
