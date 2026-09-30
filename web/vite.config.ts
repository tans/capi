import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: {
    "next/link": fileURLToPath(new URL("./src/compat/link.tsx", import.meta.url)),
    "next/navigation": fileURLToPath(new URL("./src/compat/navigation.ts", import.meta.url)),
    "@": fileURLToPath(new URL("./src", import.meta.url)),
  } },
  build: { outDir: "../internal/webui/dist", emptyOutDir: true },
  server: { port: 3211, proxy: { "/api": "http://127.0.0.1:3210", "/v1": "http://127.0.0.1:3210" } },
});
