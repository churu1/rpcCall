# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RpcCall is a cross-platform desktop gRPC debugging tool (similar to BloomRPC/Postman for gRPC). Built with **Wails v2** (Go backend + React/TypeScript frontend), it supports proto file import, gRPC reflection, all four RPC call types (unary, server-stream, client-stream, bidi-stream), TLS/mTLS, benchmarking, mock servers, payload decoding, and request history.

## Build & Development Commands

```bash
# Development (hot reload for both Go and frontend)
wails dev

# Production build (outputs to build/bin/RpcCall.app on macOS)
wails build

# Open built app (macOS)
open build/bin/RpcCall.app

# Frontend only (from frontend/ directory)
cd frontend && npm install
cd frontend && npm run dev    # Vite dev server
cd frontend && npm run build  # tsc && vite build
```

## Architecture

### Wails IPC Communication

- **Frontend → Backend**: Wails auto-generates TypeScript bindings in `frontend/wailsjs/` from public methods on the `App` struct. Frontend calls: `window.go.main.App.MethodName(args)` returning a `Promise`.
- **Backend → Frontend**: Wails Events for streaming RPC real-time data: `runtime.EventsEmit(ctx, "stream:message", data)` / `runtime.EventsOn("stream:message", callback)`.
- **Frontend component communication**: DOM `CustomEvent` (`rpccall:invoke`, `rpccall:import-file`, etc.) dispatched by CommandPalette, listened by ServiceTree/AddressBar.

### Backend (Go)

`app.go` is the IPC bridge — the `App` struct exposes ~79 public methods to the frontend. It delegates to internal packages:

- **`internal/grpc/caller.go`** — Dynamic gRPC invocation engine for all four call types. Uses `jhump/protoreflect` dynamic messages for JSON ↔ Protobuf conversion.
- **`internal/grpc/proto_parser.go`** — Proto file parsing with multi-level import resolution (built-in descriptors → absolute path → standard paths → basename index → suffix matching). Supports project-based isolation.
- **`internal/grpc/reflection.go`** — gRPC Reflection API client, caches ServiceDescriptors, filters internal services.
- **`internal/grpc/decoder.go`** — Multi-encoding protobuf payload decoder (auto-detect, hex, base64, escape, raw). Supports nested message decoding with field path rules, batch operations, and schema-less raw protobuf decoding for base64 bytes fields in JSON responses.
- **`internal/grpc/benchmark.go`** — Load testing with count/duration/QPS modes, concurrency ramp-up, latency percentiles (P50/P90/P99).
- **`internal/grpc/connection.go`** — TLS/mTLS connection configuration; `DefaultUseTLSForAddress()` enables TLS by default for port 443.
- **`internal/grpc/mock_server.go`** — Mock gRPC server for testing.
- **`internal/history/store.go`** — SQLite persistence (pure Go via `modernc.org/sqlite`, no CGO). Stores history, addresses, address TLS settings, proto sources, projects, collections, metadata profiles, decode templates, environments. DB location: `~/Library/Application Support/RpcCall/history.db`.
- **`internal/models/types.go`** — Shared data types (GrpcRequest, GrpcResponse, ServiceMethod, BenchmarkConfig, etc.).
- **`internal/ai/ai.go`** — OpenAI-compatible AI client integration.

### Frontend (React + TypeScript)

- **State management**: Zustand stores in `frontend/src/store/` — `app-store.ts` (tabs, proto files, projects), `env-store.ts` (environment variables), `theme-store.ts` (dark/light theme via CSS custom properties).
- **Components** in `frontend/src/components/` — organized by feature: `layout/`, `service-tree/`, `connection/`, `editor/`, `response/`, `history/`, `command-palette/`, `benchmark/`, `decode/`, `mock/`, `chain/`, `collection/`, `environment/`, `ai/`, `search/`, `shortcuts/`, `ui/` (reusable primitives).
- **Hooks**: `useGrpc.ts` (RPC invoke), `useAddressTls.ts` (load/save per-address TLS settings when address changes).
- **Path alias**: `@/*` maps to `frontend/src/*` (configured in tsconfig.json and vite.config.ts).
- **Wails bindings**: Auto-generated in `frontend/wailsjs/` — do not edit manually.
- **i18n**: Chinese (`zh.json`) and English (`en.json`) via i18next in `frontend/src/i18n/`.
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite` plugin. Theme colors defined as CSS variables in `index.css` using `@theme`. Utility: `cn()` from `clsx` + `tailwind-merge` in `lib/utils.ts`.

## Key Conventions

- **Input elements rule**: All `<input>` and `<textarea>` in frontend TSX must include `autoComplete="off"`, `autoCorrect="off"`, `autoCapitalize="off"`, `spellCheck={false}`, `data-form-type="other"`, `data-lpignore="true"` to prevent browser/WebView autocomplete. Exceptions: checkbox, radio, range, file inputs. This is enforced globally via a `focusin` listener in `App.tsx`.
- **Frontend assets are embedded**: `main.go` uses `//go:embed all:frontend/dist` to embed the built frontend into the Go binary.
- **SQLite is pure Go**: Uses `modernc.org/sqlite` (no CGO dependency), enabling easy cross-compilation.
- **Method descriptor resolution**: The caller tries the proto parser first, then falls back to gRPC reflection to find method descriptors.
