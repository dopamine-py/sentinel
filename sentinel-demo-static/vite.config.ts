import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Relative base so the single output file works from:
//  - GitHub Pages (https://user.github.io/repo/)
//  - a local file:// inside the Android WebView
//  - any subpath
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    // Inline ALL js/css into one self-contained index.html
    viteSingleFile(),
  ],
  build: {
    outDir: "dist",
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
