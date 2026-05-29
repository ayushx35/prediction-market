import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load env variables (mainly for environments outside Bun, Bun does this automatically)
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables are missing.');
}

// Initialize Supabase Admin Client
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
