import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { labDataPlugin } from "./vite/labData.js";

const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react(), labDataPlugin()],
  server: {
    host: true,
    port: 5173,
    fs: { allow: [repo] },
    proxy: {
      "/api": "http://127.0.0.1:2567",
      "/matchmake": "http://127.0.0.1:2567",
    },
  },
});
