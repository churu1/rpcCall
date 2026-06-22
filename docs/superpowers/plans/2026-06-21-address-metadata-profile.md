# Address Metadata Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build address-scoped default metadata profiles extracted from successful RPC response bodies.

**Architecture:** Store profiles in SQLite via `internal/history.Store`, expose Wails methods on `App`, add frontend profile types/store helpers, merge profiles in `useGrpc`, and add response/request metadata UI affordances.

**Tech Stack:** Go, SQLite, Wails, React, TypeScript, Zustand-style local app store patterns.

---

### Task 1: Backend Profile Persistence

**Files:**
- Modify: `internal/history/store.go`
- Modify: `internal/models/types.go`
- Modify: `app.go`

- [ ] Add profile table with unique `address`.
- [ ] Add profile structs and CRUD methods.
- [ ] Add refresh helper that invokes the saved source request and reapplies mappings.

### Task 2: Frontend Profile API and Merge

**Files:**
- Modify: `frontend/src/types/wails.d.ts`
- Create: `frontend/src/lib/metadata-profile.ts`
- Modify: `frontend/src/hooks/useGrpc.ts`

- [ ] Add TypeScript profile interfaces and Wails method signatures.
- [ ] Add JSON path flatten/extract and metadata merge helpers.
- [ ] Merge address profile metadata before each request, with manual request metadata taking precedence.

### Task 3: User Interface

**Files:**
- Create: `frontend/src/components/metadata/MetadataProfileDialog.tsx`
- Create: `frontend/src/components/metadata/MetadataProfileBar.tsx`
- Modify: `frontend/src/components/response/ResponseViewer.tsx`
- Modify: `frontend/src/components/editor/RequestEditor.tsx`
- Modify: `frontend/src/i18n/zh.json`
- Modify: `frontend/src/i18n/en.json`

- [ ] Add “save as default metadata” action after successful JSON response.
- [ ] Add confirmation dialog for path/key/template mappings.
- [ ] Show active profile status in metadata panel with view, refresh, enable/disable, and clear actions.

### Task 4: Verification

**Files:**
- Add: `frontend/src/lib/metadata-profile.test.mjs`

- [ ] Add focused helper tests.
- [ ] Run frontend build and Go tests.
