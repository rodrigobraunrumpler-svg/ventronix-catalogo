import { defineConfig, devices } from '@playwright/test'

// Puerto propio: las e2e nunca reutilizan la app del puerto 3000, que puede estar en `pnpm start`
// conectada al Supabase real. `pnpm dev` usa siempre .env.development.local (Supabase local).
const port = 4100
const baseURL = `http://localhost:${port}`

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  // Comparten la base de datos y las cuentas locales: una prueba a la vez.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
