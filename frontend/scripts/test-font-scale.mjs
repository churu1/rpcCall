import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const storePath = path.join(root, "src/store/font-scale-store.ts");
const commandPalettePath = path.join(root, "src/components/command-palette/CommandPalette.tsx");
const cssPath = path.join(root, "src/index.css");

const store = fs.readFileSync(storePath, "utf8");
const commandPalette = fs.readFileSync(commandPalettePath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");

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

console.log("font-scale tests passed");
