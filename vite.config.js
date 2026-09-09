import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
  },
  optimizeDeps: {
    include: ['xlsx', 'jspdf', 'jspdf-autotable'],
    esbuildOptions: {
      // xlsx uses require() internally — treat it as CommonJS
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
          'vendor-xlsx':   ['xlsx'],
          'vendor-jspdf':  ['jspdf', 'jspdf-autotable'],
          'vendor-pdfjs':  ['pdfjs-dist'],
        },
      },
    },
  },
})
