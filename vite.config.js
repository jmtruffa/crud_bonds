import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/bonds': 'http://localhost:4000',
      '/indexes': 'http://localhost:4000',
      '/day-count-conventions': 'http://localhost:4000',
      '/auth': 'http://localhost:4000',
      '/admin': 'http://localhost:4000',
      '/pdfs': 'http://localhost:4000',
    },
  },
});
