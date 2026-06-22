import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const themeStore = fs.readFileSync(path.join(root, "src/store/theme-store.ts"), "utf8");
const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");

assert.match(themeStore, /theme:\s*"light"/, "theme store should default to light");
assert.match(css, /--surface-0:\s*#f3f6fa;/, "initial CSS surface should be light");
assert.match(css, /--color-background:\s*#f3f6fa;/, "initial CSS background should be light");

console.log("default-theme tests passed");
