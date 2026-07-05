package grpc

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"os"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

type TLSConfig struct {
	UseTLS   bool   `json:"useTls"`
	CertPath string `json:"certPath"`
	KeyPath  string `json:"keyPath"`
	CaPath   string `json:"caPath"`
}

// DefaultUseTLSForAddress returns true when the address uses the standard HTTPS/gRPC-TLS port.
func DefaultUseTLSForAddress(address string) bool {
	_, port, err := net.SplitHostPort(address)
	if err != nil {
		return false
	}
	return port == "443"
}

func CreateDialOptions(tlsCfg TLSConfig) ([]grpc.DialOption, error) {
	if !tlsCfg.UseTLS {
		return []grpc.DialOption{
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		}, nil
	}

	config := &tls.Config{}

	if tlsCfg.CaPath != "" {
		caCert, err := os.ReadFile(tlsCfg.CaPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read CA cert: %w", err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(caCert) {
			return nil, fmt.Errorf("failed to parse CA cert")
		}
		config.RootCAs = pool
	}

	if tlsCfg.CertPath != "" && tlsCfg.KeyPath != "" {
		cert, err := tls.LoadX509KeyPair(tlsCfg.CertPath, tlsCfg.KeyPath)
		if err != nil {
			return nil, fmt.Errorf("failed to load client cert/key: %w", err)
		}
		config.Certificates = []tls.Certificate{cert}
	}

	return []grpc.DialOption{
		grpc.WithTransportCredentials(credentials.NewTLS(config)),
	}, nil
}
