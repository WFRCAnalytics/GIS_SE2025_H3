import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      // PMTiles uses HTTP range requests (206 Partial Content).
      // Chrome's disk cache can't store partial responses, causing
      // ERR_CACHE_OPERATION_NOT_SUPPORTED and the message-channel error.
      // Tell the browser not to cache .pmtiles responses at all.
      name: 'pmtiles-no-cache',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.includes('.pmtiles')) {
            res.setHeader('Cache-Control', 'no-store');
          }
          next();
        });
      },
    },
  ],
  base: '/GIS_SE2025_H3/',
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  worker: {
    format: 'es',
  },
})
