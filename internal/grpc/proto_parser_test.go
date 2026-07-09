package grpc

import (
	"strings"
	"testing"

	"github.com/golang/protobuf/proto"
	descriptorpb "github.com/golang/protobuf/protoc-gen-go/descriptor"
	"github.com/jhump/protoreflect/desc"
)

func buildDefaultAnyTemplateTestFile(t *testing.T) *desc.FileDescriptor {
	t.Helper()

	anyFD, err := desc.LoadFileDescriptor("google/protobuf/any.proto")
	if err != nil {
		t.Fatalf("load any descriptor: %v", err)
	}

	fd, err := desc.CreateFileDescriptor(&descriptorpb.FileDescriptorProto{
		Name:       proto.String("demo/any_template.proto"),
		Package:    proto.String("demo"),
		Dependency: []string{"google/protobuf/any.proto"},
		MessageType: []*descriptorpb.DescriptorProto{
			{
				Name: proto.String("CreateReq"),
				Field: []*descriptorpb.FieldDescriptorProto{
					{
						Name:     proto.String("req_extend"),
						JsonName: proto.String("reqExtend"),
						Number:   proto.Int32(1),
						Label:    descriptorpb.FieldDescriptorProto_LABEL_OPTIONAL.Enum(),
						Type:     descriptorpb.FieldDescriptorProto_TYPE_MESSAGE.Enum(),
						TypeName: proto.String(".google.protobuf.Any"),
					},
					{
						Name:     proto.String("unknown_any"),
						JsonName: proto.String("unknownAny"),
						Number:   proto.Int32(2),
						Label:    descriptorpb.FieldDescriptorProto_LABEL_OPTIONAL.Enum(),
						Type:     descriptorpb.FieldDescriptorProto_TYPE_MESSAGE.Enum(),
						TypeName: proto.String(".google.protobuf.Any"),
					},
				},
			},
			{
				Name: proto.String("CreateReqExtend"),
				Field: []*descriptorpb.FieldDescriptorProto{
					{
						Name:     proto.String("note"),
						JsonName: proto.String("note"),
						Number:   proto.Int32(1),
						Label:    descriptorpb.FieldDescriptorProto_LABEL_OPTIONAL.Enum(),
						Type:     descriptorpb.FieldDescriptorProto_TYPE_STRING.Enum(),
					},
					{
						Name:     proto.String("count"),
						JsonName: proto.String("count"),
						Number:   proto.Int32(2),
						Label:    descriptorpb.FieldDescriptorProto_LABEL_OPTIONAL.Enum(),
						Type:     descriptorpb.FieldDescriptorProto_TYPE_INT32.Enum(),
					},
				},
			},
		},
	}, anyFD)
	if err != nil {
		t.Fatalf("create descriptor: %v", err)
	}
	return fd
}

func TestGenerateDefaultJSONExpandsAnyWhenTypeCanBeInferred(t *testing.T) {
	fd := buildDefaultAnyTemplateTestFile(t)
	md := fd.FindMessage("demo.CreateReq")
	if md == nil {
		t.Fatal("message demo.CreateReq not found")
	}

	body := GenerateDefaultJSON(md)
	for _, want := range []string{
		`"reqExtend": {`,
		`"@type": "type.googleapis.com/demo.CreateReqExtend"`,
		`"note": ""`,
		`"count": 0`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("default body missing %s:\n%s", want, body)
		}
	}
}

func TestGenerateDefaultJSONUsesAnyTypePlaceholderWhenTypeCannotBeInferred(t *testing.T) {
	fd := buildDefaultAnyTemplateTestFile(t)
	md := fd.FindMessage("demo.CreateReq")
	if md == nil {
		t.Fatal("message demo.CreateReq not found")
	}

	body := GenerateDefaultJSON(md)
	if !strings.Contains(body, `"unknownAny": {`) || !strings.Contains(body, `"@type": ""`) {
		t.Fatalf("default body should include empty @type placeholder:\n%s", body)
	}
}
