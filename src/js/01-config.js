/* ============================================================================
   01-config.js — DocForBro runtime configuration
   Supabase project: docforbro-prod (Singapore / ap-southeast-1)
   ============================================================================ */

const CONFIG = {
  /* Supabase credentials — safe to expose, RLS protects all data */
  supabaseUrl:     'https://yrfmbhjfvrmdeqouaeqw.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyZm1iaGpmdnJtZGVxb3VhZXF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1Nzc0NzcsImV4cCI6MjEwNzE1MzQ3N30.WzVPdAGHfmTA78gORSWYoTjavKfU8qen48Wm-09wYg4',

  /* App identity */
  appName:  'DocForBro',
  version:  '1.0.0',
  domain:   'docforbro.com',

  /* Defaults */
  currency: 'USD',

  /* Storage buckets */
  storage: {
    logos:   'logos',
    exports: 'exports',
  },

  /* Auth redirect — strictly points to production for live deployment */
  authRedirectTo: 'https://docforbro.com',
};