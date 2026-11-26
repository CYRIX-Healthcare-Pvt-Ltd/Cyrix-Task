import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

/**
 * My Task lives at app.cyrix.in/tasks, behind the portal's rewrite — the
 * same arrangement as KPI at /kpi, Revive Lab at /revive and Travel Expense
 * at /travel.
 */
export default defineConfig({
  base: '/tasks/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist/tasks',
    emptyOutDir: true,
    // Outlook → Make task panel (the user, 26 Nov): its own page beside the app.
    rollupOptions: { input: { main: path.resolve(__dirname, 'index.html'), outlook: path.resolve(__dirname, 'outlook.html') } },
  },
  server: { port: 5179 },
  test: {
    environment: 'node',
  },
} as never)
