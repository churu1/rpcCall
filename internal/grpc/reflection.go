package grpc

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/grpcreflect"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"rpccall/internal/models"
)

type ReflectionClient struct {
	serviceDescriptors map[string]*desc.ServiceDescriptor
}

func NewReflectionClient() *ReflectionClient {
	return &ReflectionClient{
		serviceDescriptors: make(map[string]*desc.ServiceDescriptor),
	}
}

func (r *ReflectionClient) ListServices(address string) ([]models.ServiceDefinition, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(ctx, address,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to %s: %w", address, err)
	}
	defer conn.Close()

	refClient := grpcreflect.NewClientAuto(ctx, conn)
	defer refClient.Reset()

	serviceNames, err := refClient.ListServices()
	if err != nil {
		return nil, fmt.Errorf("failed to list services: %w", err)
	}

	var services []models.ServiceDefinition
	for _, svcName := range serviceNames {
		if strings.HasPrefix(svcName, "grpc.reflection") {
			continue
		}

		svcDesc, err := refClient.ResolveService(svcName)
		if err != nil {
			continue
		}

		r.serviceDescriptors[svcName] = svcDesc

		sd := models.ServiceDefinition{
			Name:     svcDesc.GetName(),
			FullName: svcDesc.GetFullyQualifiedName(),
		}
		for _, method := range svcDesc.GetMethods() {
			mt := models.MethodTypeUnary
			if method.IsClientStreaming() && method.IsServerStreaming() {
				mt = models.MethodTypeBidiStreaming
			} else if method.IsServerStreaming() {
				mt = models.MethodTypeServerStreaming
			} else if method.IsClientStreaming() {
				mt = models.MethodTypeClientStreaming
			}
			sd.Methods = append(sd.Methods, models.ServiceMethod{
				ServiceName:    svcDesc.GetName(),
				MethodName:     method.GetName(),
				FullName:       method.GetFullyQualifiedName(),
				MethodType:     mt,
				InputTypeName:  method.GetInputType().GetFullyQualifiedName(),
				OutputTypeName: method.GetOutputType().GetFullyQualifiedName(),
			})
		}
		services = append(services, sd)
	}

	return services, nil
}

func (r *ReflectionClient) GetServiceDescriptor(fullName string) *desc.ServiceDescriptor {
	return r.serviceDescriptors[fullName]
}
