import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SUPABASE_URL = 'https://zhexlpaugdnhnbylpoda.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_NtW6JGT8nKdAWYMu-xrVCg_MY9NcyN3';

export default defineConfig({
  root: 'client',
  base: './',
  plugins: [react()],
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(SUPABASE_PUBLISHABLE_KEY),
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
