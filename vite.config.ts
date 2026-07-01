import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react({ jsxRuntime: "automatic" })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor-react';
          }
          if (id.includes('@radix-ui/react-dialog') || id.includes('@radix-ui/react-dropdown-menu') || id.includes('@radix-ui/react-tooltip')) {
            return 'vendor-ui';
          }
          if (id.includes('@tanstack/react-query')) {
            return 'vendor-query';
          }
          if (id.includes('@supabase/supabase-js')) {
            return 'vendor-supabase';
          }
        },
      },
    },
    // Warn at 600 kB per chunk; we're using lazy loading so individual chunks
    // should stay well below this.
    chunkSizeWarningLimit: 600,
  },
});
