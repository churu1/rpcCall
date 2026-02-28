package grpc

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/jhump/protoreflect/desc"
	"github.com/jhump/protoreflect/dynamic"
	"github.com/jhump/protoreflect/dynamic/grpcdynamic"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"rpccall/internal/models"
)

type Caller struct {
	parser     *ProtoParser
	reflection *ReflectionClient
}

func NewCaller() *Caller {
	return &Caller{
		parser:     NewProtoParser(),
		reflection: NewReflectionClient(),
	}
}

func (c *Caller) SetParser(p *ProtoParser) {
	c.parser = p
}

func (c *Caller) SetReflection(r *ReflectionClient) {
	c.reflection = r
}

func (c *Caller) findMethodDescriptor(serviceName, methodName string) (*desc.MethodDescriptor, error) {
	for _, fd := range c.parser.GetAllFileDescriptors() {
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

	svcDesc := c.reflection.GetServiceDescriptor(serviceName)
	if svcDesc != nil {
		for _, md := range svcDesc.GetMethods() {
			if md.GetName() == methodName {
				return md, nil
			}
		}
	}

	return nil, fmt.Errorf("method %s/%s not found", serviceName, methodName)
}

func dialWithConfig(address string, req models.GrpcRequest) (*grpc.ClientConn, error) {
	tlsCfg := TLSConfig{
		UseTLS:   req.UseTLS,
		CertPath: req.CertPath,
		KeyPath:  req.KeyPath,
		CaPath:   req.CaPath,
	}
	opts, err := CreateDialOptions(tlsCfg)
	if err != nil {
		return nil, fmt.Errorf("TLS configuration error: %w", err)
	}
	conn, err := grpc.Dial(address, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to %s: %w", address, err)
	}
	return conn, nil
}

func buildOutgoingMetadata(entries []models.MetadataEntry) metadata.MD {
	md := metadata.MD{}
	for _, e := range entries {
		if e.Key != "" && e.Value != "" {
			md.Append(e.Key, e.Value)
		}
	}
	return md
}

func mdToEntries(md metadata.MD) []models.MetadataEntry {
	var entries []models.MetadataEntry
	for k, vals := range md {
		for _, v := range vals {
			entries = append(entries, models.MetadataEntry{Key: k, Value: v})
		}
	}
	return entries
}

func (c *Caller) InvokeUnary(req models.GrpcRequest) (*models.GrpcResponse, error) {
	methodDesc, err := c.findMethodDescriptor(req.ServiceName, req.MethodName)
	if err != nil {
		return nil, err
	}

	t0 := time.Now()
	conn, err := dialWithConfig(req.Address, req)
	tConnect := time.Since(t0)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	tSerStart := time.Now()
	reqMsg := dynamic.NewMessage(methodDesc.GetInputType())
	if err := reqMsg.UnmarshalJSON([]byte(req.Body)); err != nil {
		return nil, fmt.Errorf("invalid request JSON: %w", err)
	}
	tSerialize := time.Since(tSerStart)

	ctx := context.Background()
	if len(req.Metadata) > 0 {
		ctx = metadata.NewOutgoingContext(ctx, buildOutgoingMetadata(req.Metadata))
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	stub := grpcdynamic.NewStub(conn)

	var respHeaders, respTrailers metadata.MD
	tRpcStart := time.Now()
	resp, err := stub.InvokeRpc(ctx, methodDesc, reqMsg,
		grpc.Header(&respHeaders),
		grpc.Trailer(&respTrailers),
	)
	tRPC := time.Since(tRpcStart)
	totalElapsed := time.Since(t0)
	elapsed := totalElapsed.Milliseconds()

	timing := &models.TimingDetail{
		ConnectMs:   float64(tConnect.Microseconds()) / 1000,
		SerializeMs: float64(tSerialize.Microseconds()) / 1000,
		RpcMs:       float64(tRPC.Microseconds()) / 1000,
		TotalMs:     float64(totalElapsed.Microseconds()) / 1000,
	}

	if err != nil {
		st, _ := status.FromError(err)
		return &models.GrpcResponse{
			Body:       "",
			Headers:    mdToEntries(respHeaders),
			Trailers:   mdToEntries(respTrailers),
			StatusCode: st.Code().String(),
			ElapsedMs:  elapsed,
			Error:      st.Message(),
			Timing:     timing,
		}, nil
	}

	respJSON, marshalErr := resp.(*dynamic.Message).MarshalJSONIndent()
	if marshalErr != nil {
		return nil, fmt.Errorf("failed to marshal response: %w", marshalErr)
	}

	return &models.GrpcResponse{
		Body:       string(respJSON),
		Headers:    mdToEntries(respHeaders),
		Trailers:   mdToEntries(respTrailers),
		StatusCode: "OK",
		ElapsedMs:  elapsed,
		Timing:     timing,
	}, nil
}

func (c *Caller) InvokeServerStream(req models.GrpcRequest, onMessage func(string), onDone func(models.GrpcResponse)) error {
	methodDesc, err := c.findMethodDescriptor(req.ServiceName, req.MethodName)
	if err != nil {
		return err
	}

	conn, err := dialWithConfig(req.Address, req)
	if err != nil {
		return err
	}

	reqMsg := dynamic.NewMessage(methodDesc.GetInputType())
	if err := reqMsg.UnmarshalJSON([]byte(req.Body)); err != nil {
		conn.Close()
		return fmt.Errorf("invalid request JSON: %w", err)
	}

	ctx := context.Background()
	if len(req.Metadata) > 0 {
		ctx = metadata.NewOutgoingContext(ctx, buildOutgoingMetadata(req.Metadata))
	}

	stub := grpcdynamic.NewStub(conn)

	go func() {
		defer conn.Close()
		start := time.Now()

		stream, err := stub.InvokeRpcServerStream(ctx, methodDesc, reqMsg)
		if err != nil {
			st, _ := status.FromError(err)
			onDone(models.GrpcResponse{
				StatusCode: st.Code().String(),
				ElapsedMs:  time.Since(start).Milliseconds(),
				Error:      st.Message(),
			})
			return
		}

		var allMessages []string
		for {
			resp, err := stream.RecvMsg()
			if err == io.EOF {
				break
			}
			if err != nil {
				st, _ := status.FromError(err)
				headers, _ := stream.Header()
				onDone(models.GrpcResponse{
					Body:       strings.Join(allMessages, "\n---\n"),
					Headers:    mdToEntries(headers),
					Trailers:   mdToEntries(stream.Trailer()),
					StatusCode: st.Code().String(),
					ElapsedMs:  time.Since(start).Milliseconds(),
					Error:      st.Message(),
				})
				return
			}
			jsonBytes, marshalErr := resp.(*dynamic.Message).MarshalJSONIndent()
			if marshalErr != nil {
				onMessage(fmt.Sprintf(`{"error":"marshal failed: %s"}`, marshalErr.Error()))
				continue
			}
			msgStr := string(jsonBytes)
			allMessages = append(allMessages, msgStr)
			onMessage(msgStr)
		}

		headers, _ := stream.Header()
		onDone(models.GrpcResponse{
			Body:       strings.Join(allMessages, "\n---\n"),
			Headers:    mdToEntries(headers),
			Trailers:   mdToEntries(stream.Trailer()),
			StatusCode: "OK",
			ElapsedMs:  time.Since(start).Milliseconds(),
		})
	}()

	return nil
}

func (c *Caller) InvokeClientStream(req models.GrpcRequest) (*models.GrpcResponse, error) {
	methodDesc, err := c.findMethodDescriptor(req.ServiceName, req.MethodName)
	if err != nil {
		return nil, err
	}

	conn, err := dialWithConfig(req.Address, req)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	ctx := context.Background()
	if len(req.Metadata) > 0 {
		ctx = metadata.NewOutgoingContext(ctx, buildOutgoingMetadata(req.Metadata))
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	stub := grpcdynamic.NewStub(conn)

	stream, err := stub.InvokeRpcClientStream(ctx, methodDesc)
	if err != nil {
		return nil, fmt.Errorf("failed to start client stream: %w", err)
	}

	var messages []json.RawMessage
	if err := json.Unmarshal([]byte(req.Body), &messages); err != nil {
		msg := dynamic.NewMessage(methodDesc.GetInputType())
		if err := msg.UnmarshalJSON([]byte(req.Body)); err != nil {
			return nil, fmt.Errorf("invalid request JSON: %w", err)
		}
		if err := stream.SendMsg(msg); err != nil {
			return nil, fmt.Errorf("failed to send message: %w", err)
		}
	} else {
		for _, rawMsg := range messages {
			msg := dynamic.NewMessage(methodDesc.GetInputType())
			if err := msg.UnmarshalJSON(rawMsg); err != nil {
				return nil, fmt.Errorf("invalid message in array: %w", err)
			}
			if err := stream.SendMsg(msg); err != nil {
				return nil, fmt.Errorf("failed to send message: %w", err)
			}
		}
	}

	start := time.Now()
	resp, err := stream.CloseAndReceive()
	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		st, _ := status.FromError(err)
		headers, _ := stream.Header()
		return &models.GrpcResponse{
			Headers:    mdToEntries(headers),
			Trailers:   mdToEntries(stream.Trailer()),
			StatusCode: st.Code().String(),
			ElapsedMs:  elapsed,
			Error:      st.Message(),
		}, nil
	}

	respJSON, marshalErr := resp.(*dynamic.Message).MarshalJSONIndent()
	if marshalErr != nil {
		return nil, fmt.Errorf("failed to marshal response: %w", marshalErr)
	}
	headers, _ := stream.Header()

	return &models.GrpcResponse{
		Body:       string(respJSON),
		Headers:    mdToEntries(headers),
		Trailers:   mdToEntries(stream.Trailer()),
		StatusCode: "OK",
		ElapsedMs:  elapsed,
	}, nil
}

func (c *Caller) InvokeBidiStream(req models.GrpcRequest, onMessage func(string), onDone func(models.GrpcResponse)) error {
	methodDesc, err := c.findMethodDescriptor(req.ServiceName, req.MethodName)
	if err != nil {
		return err
	}

	conn, err := dialWithConfig(req.Address, req)
	if err != nil {
		return err
	}

	ctx := context.Background()
	if len(req.Metadata) > 0 {
		ctx = metadata.NewOutgoingContext(ctx, buildOutgoingMetadata(req.Metadata))
	}

	stub := grpcdynamic.NewStub(conn)

	go func() {
		defer conn.Close()
		start := time.Now()

		stream, err := stub.InvokeRpcBidiStream(ctx, methodDesc)
		if err != nil {
			st, _ := status.FromError(err)
			onDone(models.GrpcResponse{
				StatusCode: st.Code().String(),
				ElapsedMs:  time.Since(start).Milliseconds(),
				Error:      st.Message(),
			})
			return
		}

		var messages []json.RawMessage
		if err := json.Unmarshal([]byte(req.Body), &messages); err != nil {
			msg := dynamic.NewMessage(methodDesc.GetInputType())
			if jsonErr := msg.UnmarshalJSON([]byte(req.Body)); jsonErr == nil {
				stream.SendMsg(msg)
			}
		} else {
			for _, rawMsg := range messages {
				msg := dynamic.NewMessage(methodDesc.GetInputType())
				if jsonErr := msg.UnmarshalJSON(rawMsg); jsonErr == nil {
					stream.SendMsg(msg)
				}
			}
		}
		stream.CloseSend()

		var allMessages []string
		for {
			resp, err := stream.RecvMsg()
			if err == io.EOF {
				break
			}
			if err != nil {
				st, _ := status.FromError(err)
				headers, _ := stream.Header()
				onDone(models.GrpcResponse{
					Body:       strings.Join(allMessages, "\n---\n"),
					Headers:    mdToEntries(headers),
					Trailers:   mdToEntries(stream.Trailer()),
					StatusCode: st.Code().String(),
					ElapsedMs:  time.Since(start).Milliseconds(),
					Error:      st.Message(),
				})
				return
			}
			jsonBytes, marshalErr := resp.(*dynamic.Message).MarshalJSONIndent()
			if marshalErr != nil {
				onMessage(fmt.Sprintf(`{"error":"marshal failed: %s"}`, marshalErr.Error()))
				continue
			}
			msgStr := string(jsonBytes)
			allMessages = append(allMessages, msgStr)
			onMessage(msgStr)
		}

		headers, _ := stream.Header()
		onDone(models.GrpcResponse{
			Body:       strings.Join(allMessages, "\n---\n"),
			Headers:    mdToEntries(headers),
			Trailers:   mdToEntries(stream.Trailer()),
			StatusCode: "OK",
			ElapsedMs:  time.Since(start).Milliseconds(),
		})
	}()

	return nil
}
