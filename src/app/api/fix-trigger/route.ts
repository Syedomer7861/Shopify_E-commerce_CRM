import { NextRequest, NextResponse } from "next/server";

/**
 * ONE-TIME FIX: Patches the Supabase handle_new_user trigger
 * to use ON CONFLICT DO NOTHING so it doesn't crash when
 * extra NOT NULL columns exist in the profiles table.
 * 
 * Call this ONCE at: GET /api/fix-trigger
 * Protected by CRON_SECRET header for safety.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectRef = "mknxjfviqavylvsxsigs";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return NextResponse.json({ error: "Missing service key" }, { status: 500 });
  }

  // Use Supabase Management API to run SQL
  const sql = `
    -- Fix 1: Update trigger to be resilient
    CREATE OR REPLACE FUNCTION handle_new_user()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO public.profiles (id, email, name, role)
      VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'name', ''),
        CASE 
          WHEN new.raw_user_meta_data->>'role' IN ('admin', 'agent', 'manager', 'hr')
          THEN new.raw_user_meta_data->>'role'
          ELSE 'agent'
        END
      )
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Fix 2: Make extra profile columns nullable so trigger doesn't crash
    ALTER TABLE public.profiles 
      ALTER COLUMN designation DROP NOT NULL,
      ALTER COLUMN department DROP NOT NULL,
      ALTER COLUMN phone DROP NOT NULL,
      ALTER COLUMN joining_date DROP NOT NULL,
      ALTER COLUMN monthly_salary DROP NOT NULL,
      ALTER COLUMN location DROP NOT NULL,
      ALTER COLUMN emergency_contact DROP NOT NULL;
  `;

  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });

    const text = await res.text();
    
    if (!res.ok) {
      return NextResponse.json({ 
        error: "Management API call failed", 
        status: res.status,
        detail: text 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Trigger fixed successfully. Employee creation should now work.",
      detail: text
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
