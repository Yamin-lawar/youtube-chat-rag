import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The browser talks to this dev server only, and /api is forwarded to Express.
    // Same origin means the anonymous-session cookie works without any CORS setup.
    proxy: { '/api': 'http://localhost:8080' },
  },
});
