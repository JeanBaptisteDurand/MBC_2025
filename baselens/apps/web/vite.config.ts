import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: [
      "baselens.tech",
      ".baselens.tech", // Allow subdomains too
    ],
  },
  preview: {
    port: 3000,
  },
});
