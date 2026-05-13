const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log("Adding courier_name column to orders table...");
  
  // Since we can't run raw SQL via the client easily, we'll try to use a function if it exists,
  // or we can use the 'rpc' method if a 'exec_sql' function was created by the user.
  // HOWEVER, a common trick is to use the 'pg_net' or similar, but let's assume we don't have it.
  
  // Alternative: We can try to use a REST API call to Supabase SQL endpoint if we had the password,
  // but we only have the service role key.
  
  // Since I am an AI, I will propose the SQL to the user to run in their Dashboard,
  // OR I will check if I can add it via a Supabase Migration file that will be picked up.
  
  console.log("Please run the following SQL in your Supabase SQL Editor:");
  console.log("ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier_name VARCHAR(100);");
}

migrate();
