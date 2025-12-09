import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    // Uncomment below to enable HTTPS (required for camera on Android Chrome when not using localhost)
    // https: true,
    // For production, use proper SSL certificates
  }
})

