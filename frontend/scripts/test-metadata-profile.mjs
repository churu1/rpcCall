import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const helperPath = path.join(root, "src/lib/metadata-profile.ts");
const useGrpcPath = path.join(root, "src/hooks/useGrpc.ts");
const responseViewerPath = path.join(root, "src/components/response/ResponseViewer.tsx");
const requestEditorPath = path.join(root, "src/components/editor/RequestEditor.tsx");
const profileBarPath = path.join(root, "src/components/metadata/MetadataProfileBar.tsx");
const zhPath = path.join(root, "src/i18n/zh.json");
const enPath = path.join(root, "src/i18n/en.json");

const helper = fs.readFileSync(helperPath, "utf8");
const useGrpc = fs.readFileSync(useGrpcPath, "utf8");
const responseViewer = fs.readFileSync(responseViewerPath, "utf8");
const requestEditor = fs.readFileSync(requestEditorPath, "utf8");
const profileBar = fs.readFileSync(profileBarPath, "utf8");
const zh = fs.readFileSync(zhPath, "utf8");
const en = fs.readFileSync(enPath, "utf8");

assert.match(helper, /export function flattenJsonPaths/, "helper should flatten response JSON fields");
assert.match(helper, /export function getJsonPathValue/, "helper should read dot-path values");
assert.match(helper, /export function applyMetadataMappings/, "helper should apply field mappings");
assert.match(helper, /replaceAll\("\{\{value\}\}", rawValue\)/, "mapping should support {{value}} templates");
assert.match(helper, /export function mergeMetadata/, "helper should merge default and manual metadata");
assert.match(helper, /manualKeys\.has\(profileEntry\.key\.toLowerCase\(\)\)/, "manual metadata should win key conflicts");

assert.match(useGrpc, /GetMetadataProfile\(tab\.address\)/, "sending should load profile for current address");
assert.match(useGrpc, /mergeMetadata\(tab\.metadata/, "sending should merge profile metadata with tab metadata");
assert.match(responseViewer, /MetadataProfileDialog/, "response viewer should expose save dialog");
assert.match(responseViewer, /Save.*Metadata|saveDefault/, "response viewer should include save metadata action");
assert.match(requestEditor, /MetadataProfileBar/, "metadata panel should show address profile bar");
assert.match(profileBar, /group\/profile/, "profile bar should define a hover group");
assert.match(profileBar, /group-hover\/profile:opacity-100/, "profile bar should reveal metadata details on hover");
assert.match(profileBar, /entry\.key.*entry\.value/s, "profile hover details should show metadata keys and values");
assert.match(zh, /默认 Metadata/, "Chinese help should mention default metadata");
assert.match(zh, /来源 RPC/, "Chinese help should explain refresh source RPC");
assert.match(en, /default Metadata/i, "English help should mention default metadata");
assert.match(en, /source RPC/i, "English help should explain refresh source RPC");

console.log("metadata profile helper tests passed");
