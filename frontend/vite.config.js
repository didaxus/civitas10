import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const vendorChunk = (id) => {
  if (!id.includes('/node_modules/')) return undefined
  if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react-router') || id.includes('/node_modules/scheduler/')) return 'react'
  if (id.includes('/node_modules/@logto/')) return 'logto'
  if (id.includes('/node_modules/@tabler/icons-react/')) return 'icons'
  return 'vendor'
}

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
})
