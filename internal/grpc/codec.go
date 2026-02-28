package grpc

import (
	"github.com/jhump/protoreflect/desc"
)

func FindMethodDescriptor(serviceName, methodName string, fileDescs []*desc.FileDescriptor) *desc.MethodDescriptor {
	for _, fd := range fileDescs {
		for _, svc := range fd.GetServices() {
			if svc.GetFullyQualifiedName() == serviceName || svc.GetName() == serviceName {
				for _, md := range svc.GetMethods() {
					if md.GetName() == methodName {
						return md
					}
				}
			}
		}
	}
	return nil
}
