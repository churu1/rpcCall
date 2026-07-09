package grpc

import (
	"bytes"
	"encoding/json"

	"github.com/golang/protobuf/jsonpb"
	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/dynamic"
)

var jsonMarshaler = &jsonpb.Marshaler{
	EmitDefaults: true,
	Indent:       "  ",
}

type dynamicJSONCodec struct {
	factory  *dynamic.MessageFactory
	resolver jsonpb.AnyResolver
}

func newDynamicJSONCodec(files []*desc.FileDescriptor) dynamicJSONCodec {
	factory := dynamic.NewMessageFactoryWithDefaults()
	codec := dynamicJSONCodec{factory: factory}
	if len(files) > 0 {
		codec.resolver = dynamic.AnyResolver(factory, files...)
	}
	return codec
}

func (c dynamicJSONCodec) newMessage(md *desc.MessageDescriptor) *dynamic.Message {
	if c.factory == nil {
		return dynamic.NewMessage(md)
	}
	return c.factory.NewDynamicMessage(md)
}

func (c dynamicJSONCodec) unmarshal(msg *dynamic.Message, data []byte) error {
	return msg.UnmarshalJSONPB(&jsonpb.Unmarshaler{AnyResolver: c.resolver}, data)
}

func (c dynamicJSONCodec) marshal(msg *dynamic.Message) ([]byte, error) {
	marshaler := *jsonMarshaler
	marshaler.AnyResolver = c.resolver
	var buf bytes.Buffer
	if err := marshaler.Marshal(&buf, msg); err != nil {
		return nil, err
	}
	var formatted bytes.Buffer
	if err := json.Indent(&formatted, buf.Bytes(), "", "  "); err != nil {
		return nil, err
	}
	return formatted.Bytes(), nil
}

func collectProjectFiles(parser *ProtoParser, projectID string) []*desc.FileDescriptor {
	if parser == nil {
		return nil
	}
	return parser.GetAllFileDescriptorsByProject(projectID)
}

func collectAllParserFiles(parser *ProtoParser) []*desc.FileDescriptor {
	if parser == nil {
		return nil
	}
	var files []*desc.FileDescriptor
	seen := map[*desc.FileDescriptor]struct{}{}
	for projectID := range parser.fileDescriptors {
		for _, fd := range parser.GetAllFileDescriptorsByProject(projectID) {
			if _, ok := seen[fd]; ok {
				continue
			}
			seen[fd] = struct{}{}
			files = append(files, fd)
		}
	}
	return files
}

func appendUniqueFile(files []*desc.FileDescriptor, seen map[*desc.FileDescriptor]struct{}, fd *desc.FileDescriptor) []*desc.FileDescriptor {
	if fd == nil {
		return files
	}
	if _, ok := seen[fd]; ok {
		return files
	}
	seen[fd] = struct{}{}
	return append(files, fd)
}
