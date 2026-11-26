import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crearProxyLogin } from './vite-login.js';

const destino = process.env.REACT_GATEWAY_URL || 'http://127.0.0.1:8090';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'login-react',
      apply: 'serve',
      configureServer(servidor) {
        servidor.middlewares.use(crearProxyLogin({
          destino,
          clientId: process.env.REACT_OAUTH_CLIENT_ID,
          clientSecret: process.env.REACT_OAUTH_CLIENT_SECRET,
        }));
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: destino,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});