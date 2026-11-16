import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No proxy: the app talks to whatever bridge the phone was pointed at, so the same build works on
// Vercel, on a LAN address and on a tunnel.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { target: 'es2019' },
});
