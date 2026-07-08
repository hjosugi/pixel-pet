import { defineConfig } from "vite";

export default defineConfig({
  // Desktop builds serve from the root; the GitHub Pages workflow sets
  // PIXEL_PET_BASE to the repo subpath so the hosted web demo resolves assets.
  base: process.env.PIXEL_PET_BASE ?? "/",
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
