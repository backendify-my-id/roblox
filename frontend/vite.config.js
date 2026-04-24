import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      "localhost",
      "192.168.1.11",
      "roblox.backendify.my.id"
    ]
  },
})
