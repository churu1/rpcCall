# Address Metadata Profile Design

## Goal

Add an address-scoped default metadata workflow: after a successful RPC call, users can extract fields from the JSON response body, confirm mappings, and save the resulting key/value pairs as default metadata for the current address.

## Scope

- Profiles are scoped by exact `address`.
- Extraction source is the RPC response body JSON.
- Users can map a response path to a metadata key and optionally wrap the value with a template such as `Bearer {{value}}`.
- Later requests to the same address auto-include enabled profile metadata.
- If a request already contains the same metadata key, the manual request value wins.
- Profiles can be viewed, enabled/disabled, refreshed from the saved source request, and cleared.

## Architecture

- Backend persists profiles in the existing SQLite history store.
- Frontend provides a confirmation dialog from the response panel.
- Request sending loads the profile for the active tab address and merges it into outgoing metadata before invoking Wails backend methods.
- Refresh replays the saved source request and reapplies saved mappings, requiring the user to inspect the resulting profile state through the metadata panel.

## Non-Goals

- No token expiry or automatic refresh in the first version.
- No cross-address sharing.
- No integration with environment variables.
