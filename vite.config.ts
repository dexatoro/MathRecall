import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
export default defineConfig({plugins:[react(),tailwind()],test:{environment:'node',setupFiles:['./src/test/setup.ts'],include:['src/**/*.test.ts']}})
