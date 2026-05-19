// Converts the built single-file dist/index.html into a React Native module
// that exports the HTML as a string, written into the mobile app so the
// WebView can render it from a bundled local source (offline, no hosting).
//
// Usage: node scripts/to-rn-module.mjs
// (runs automatically via `npm run build:bundle`)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SRC = resolve(root, "dist/index.html");

// Single source of truth → emitted to BOTH consumers:
//  1. the Expo mobile app (WebView, offline)
//  2. the main web app's /demo route (iframe wrapper)
const TARGETS = [
  {
    dest: resolve(root, "../signal-intelligence-main/ciro-mobile/src/demoHtml.js"),
    header:
      "// AUTO-GENERATED — do not edit by hand.\n" +
      "// Source: sentinel-demo-static (npm run build:bundle)\n" +
      "// The full self-playing cinematic demo, inlined as a single HTML string.\n" +
      "// Loaded by OnboardingScreen via <WebView source={{ html: demoHtml }} />.\n" +
      "/* eslint-disable */",
    label: "mobile APK (WebView)",
  },
  {
    dest: resolve(root, "../urban-sentinel-main/src/demoHtml.ts"),
    header:
      "// AUTO-GENERATED — do not edit by hand.\n" +
      "// Source: sentinel-demo-static (npm run build:bundle)\n" +
      "// The full self-playing cinematic demo, inlined as a single HTML string.\n" +
      "// Embedded by the /demo route via <iframe srcDoc={demoHtml} />.\n" +
      "/* eslint-disable */",
    label: "web app (/demo iframe)",
  },
];

if (!existsSync(SRC)) {
  console.error(`✗ ${SRC} not found — run \`npm run build\` first.`);
  process.exit(1);
}

const html = readFileSync(SRC, "utf8");

// Escape for a JS template literal: backslash → \\, backtick → \`, ${ → \${
const escaped = html
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

for (const { dest, header, label } of TARGETS) {
  const out = `${header}\nconst demoHtml = \`${escaped}\`;\nexport default demoHtml;\n`;
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, out, "utf8");
  const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(0);
  console.log(`✓ Wrote ${dest}`);
  console.log(`  ${label}: ${kb} KB`);
}
