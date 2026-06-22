import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const requestEditorPath = path.join(root, "src/components/editor/RequestEditor.tsx");
const zhPath = path.join(root, "src/i18n/zh.json");
const enPath = path.join(root, "src/i18n/en.json");

const requestEditor = fs.readFileSync(requestEditorPath, "utf8");
const zh = fs.readFileSync(zhPath, "utf8");
const en = fs.readFileSync(enPath, "utf8");

assert.match(requestEditor, /function getJsonParseErrorMessage/, "request editor should format native JSON parse errors");
assert.match(requestEditor, /setBodyJsonError\(getJsonParseErrorMessage\(error,\s*t\)\)/, "request body format/minify should show specific parse errors");
assert.match(requestEditor, /setJsonError\(getJsonParseErrorMessage\(error,\s*t\)\)/, "metadata JSON mode should show specific parse errors");
assert.match(requestEditor, /onChange=\{\(nextValue\) => \{[\s\S]*setBodyJsonError\(null\)/, "editing request body should clear JSON parse errors");
assert.match(zh, /JSON 解析失败/, "Chinese locale should include specific JSON parse prefix");
assert.match(en, /JSON parse failed/, "English locale should include specific JSON parse prefix");

console.log("request JSON error tests passed");
