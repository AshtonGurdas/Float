import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { floatApi } from './server/plugin.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key]
  }
  if (!process.env.SUPABASE_URL && env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = env.VITE_SUPABASE_URL
  }
  return {
    plugins: [react(), floatApi()],
    server: {
      host: true,
      port: 5178,
    },
  }
})
