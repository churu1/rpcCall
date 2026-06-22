import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const storePath = path.join(root, "src/store/font-scale-store.ts");
const commandPalettePath = path.join(root, "src/components/command-palette/CommandPalette.tsx");
const cssPath = path.join(root, "src/index.css");
const jsonEditorPath = path.join(root, "src/components/editor/JsonEditor.tsx");
const responseViewerPath = path.join(root, "src/components/response/ResponseViewer.tsx");
const jsonTreeViewerPath = path.join(root, "src/components/response/JsonTreeViewer.tsx");
const serviceTreePath = path.join(root, "src/components/service-tree/ServiceTree.tsx");

const store = fs.readFileSync(storePath, "utf8");
const commandPalette = fs.readFileSync(commandPalettePath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const jsonEditor = fs.readFileSync(jsonEditorPath, "utf8");
const responseViewer = fs.readFileSync(responseViewerPath, "utf8");
const jsonTreeViewer = fs.readFileSync(jsonTreeViewerPath, "utf8");
const serviceTree = fs.readFileSync(serviceTreePath, "utf8");

assert.match(store, /FONT_SCALE_STORAGE_KEY\s*=\s*"rpccall-font-scale"/, "font scale should be persisted");
assert.match(store, /FONT_SCALE_STEPS\s*=\s*\[80,\s*90,\s*100,\s*110,\s*120,\s*130,\s*140,\s*150\]/, "font scale steps should be bounded");
assert.match(store, /scale:\s*loadInitialScale\(\)/, "store should restore initial scale");
assert.match(store, /document\.documentElement\.style\.setProperty\("--app-font-scale"/, "store should apply CSS variable");

assert.match(commandPalette, /increaseFontScale/, "Cmd+plus should call increaseFontScale");
assert.match(commandPalette, /decreaseFontScale/, "Cmd+minus should call decreaseFontScale");
assert.match(commandPalette, /resetFontScale/, "Cmd+0 should reset font scale");
assert.match(commandPalette, /e\.key === "="/, "Cmd+= should be treated as zoom in");
assert.match(commandPalette, /e\.key === "\+"/, "Cmd++ should be treated as zoom in");
assert.match(commandPalette, /e\.key === "-"/, "Cmd+- should be treated as zoom out");

assert.match(css, /--app-font-scale:\s*1;/, "CSS should define default font scale");
assert.match(css, /font-size:\s*calc\(14px \* var\(--app-font-scale\)\)/, "body font size should use scale variable");
assert.match(css, /font-size:\s*calc\(var\(--rpccall-text-11\) \* var\(--app-font-scale\)\)/, "absolute text utilities should scale");
assert.match(css, /height:\s*calc\(30px \* var\(--app-font-scale\)\)/, "fixed px controls should grow with font scale");
assert.doesNotMatch(jsonEditor, /fontSize:\s*13/, "JSON editor should not use fixed px font size");
assert.match(jsonEditor, /fontSize:\s*'var\(--rpccall-json-font-size\)'/, "JSON editor should use scalable font variable");
assert.match(responseViewer, /text-\[var\(--rpccall-json-font-size\)\]/, "raw response JSON should use scalable font variable");
assert.match(jsonTreeViewer, /text-\[var\(--rpccall-json-font-size\)\]/, "tree response JSON should use scalable font variable");
assert.match(serviceTree, /flex-wrap/, "service tree toolbar should wrap when font scale grows");

console.log("font-scale tests passed");
