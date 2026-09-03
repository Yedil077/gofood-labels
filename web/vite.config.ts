import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// В разработке запускайте `netlify dev` в корне репозитория (порт 8888):
// он поднимает этот Vite-сервер и функции /api вместе.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  build: { outDir: 'dist' },
});
