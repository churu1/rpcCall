import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const useGrpcPath = path.join(root, "src/hooks/useGrpc.ts");
const requestEditorPath = path.join(root, "src/components/editor/RequestEditor.tsx");

const useGrpc = fs.readFileSync(useGrpcPath, "utf8");
const requestEditor = fs.readFileSync(requestEditorPath, "utf8");

assert.match(useGrpc, /function getJsonParseErrorMessage/, "send hook should format native JSON parse errors");
assert.match(useGrpc, /useTranslation/, "send hook should localize JSON parse errors");
assert.match(useGrpc, /JSON\.parse\(tab\.requestBody\)/, "send hook should validate request JSON before invoking gRPC");
assert.match(useGrpc, /window\.dispatchEvent\(new CustomEvent\("rpccall:request-json-error"/, "send hook should notify request editor about JSON errors");
assert.match(useGrpc, /responseBody:\s*`Error: \$\{message\}`/, "send hook should show parse error in response area");
assert.match(useGrpc, /e instanceof Error \? e\.message : String\(e\)/, "send hook should not collapse non-standard errors to Unknown error");
assert.match(requestEditor, /rpccall:request-json-error/, "request editor should listen for send-time JSON errors");
assert.match(requestEditor, /setActivePanel\("body"\)/, "send-time JSON errors should bring user back to request body");

console.log("send JSON error tests passed");
