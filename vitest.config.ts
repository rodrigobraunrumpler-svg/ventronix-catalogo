import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/support/server-only.ts', import.meta.url)),
    },
  },
  test: {
    // En UTC, como GitHub Actions y Vercel. El equipo de desarrollo está en hora de Lima, y eso
    // escondería los errores de zona horaria: las fechas de la app siempre se calculan en Lima.
    env: { TZ: 'UTC' },
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['tests/components/**/*.test.tsx'],
          setupFiles: ['tests/setup.ts'],
          // Los recorridos con user-event tardan ~1 s solos, pero con todos los archivos de jsdom en
          // paralelo pasan de los 5 s por defecto.
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          // Comparten la base de datos local: un archivo a la vez.
          fileParallelism: false,
        },
      },
    ],
  },
})
