import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
      "/auth": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
      // Fichiers televerses. Django les sert lui-meme en developpement
      // (DEBUG=True) ; sans ce proxy, un logo televerse renvoie un 404 car
      // Vite chercherait /media/... dans ses propres assets statiques.
      // En production, ce chemin pointe vers Azure Blob Storage et ne passe
      // ni par Vite ni par Django.
      "/media": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
    },
  },
});
