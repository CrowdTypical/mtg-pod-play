import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'archidekt-dev-proxy',
      configureServer(server) {
        server.middlewares.use('/api/archidekt-proxy', async (req, res) => {
          const url = new URL(req.url || '', 'http://localhost');
          const path = url.searchParams.get('path');
          if (!path) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing "path" query parameter.' }));
            return;
          }
          try {
            const target = `https://archidekt.com/api/${path}`;
            const response = await fetch(target, {
              headers: {
                Accept: 'application/json',
                'User-Agent': 'MTG-Pod-Play/1.0 (dev)',
              },
            });
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.statusCode = response.status;
            res.end(await response.text());
          } catch {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to reach Archidekt.' }));
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
  },
});