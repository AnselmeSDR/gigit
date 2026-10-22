import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { createApi } from "./server/api.js"

// Serves the same /api routes as server/index.js during development
function gigitApi(): Plugin {
  return {
    name: "gigit-api",
    configureServer(server) {
      server.middlewares.use(createApi())
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), gigitApi()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  // Local tool: a single ~500 kB bundle is fine, no need to code-split
  build: {
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: "127.0.0.1",
    port: 8791,
    strictPort: true,
  },
})
