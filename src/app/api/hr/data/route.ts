import { NextRequest, NextResponse } from "next/server";
import { requireInternal } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    if (type === "employees") {
      const { data, error } = await supabase.from("profiles").select("*").order("is_active", { ascending: false });
      if (error) throw error;
      return NextResponse.json(data);
    }

    if (type === "announcements") {
      const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json(data);
    }

    if (type === "policies") {
      const { data, error } = await supabase.from("hr_policies").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json(data);
    }

    if (type === "revisions") {
      const { data, error } = await supabase.from("salary_revisions").select("*, profiles(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json(data);
    }

    if (type === "expenses") {
      const { data, error } = await supabase.from("expenses").select("*, profiles(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json(data);
    }

    if (type === "reviews") {
      const { data, error } = await supabase.from("performance_reviews").select("*, profiles(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json(data);
    }

    if (type === "training") {
      const { data, error } = await supabase.from("training_assignments").select("*, profiles(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json(data);
    }

    if (type === "grievances") {
      const { data, error } = await supabase.from("grievances").select("*, profiles(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json(data);
    }

    if (type === "attendance") {
      const { data, error } = await supabase.from("attendance_log").select("*").order("date", { ascending: false });
      if (error) throw error;
      return NextResponse.json(data);
    }



    // Default: Fetch everything for a full sync
    const [employees, announcements, policies, revisions, expenses, reviews, training, grievances, attendance, rawLogs] = await Promise.all([
      supabase.from("profiles").select("*").order("is_active", { ascending: false }),
      supabase.from("announcements").select("*").order("is_pinned", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("hr_policies").select("*").order("created_at", { ascending: false }),
      supabase.from("salary_revisions").select("*, profiles(name)").order("created_at", { ascending: false }),
      supabase.from("expenses").select("*, profiles(name)").order("created_at", { ascending: false }),
      supabase.from("performance_reviews").select("*, profiles(name)").order("created_at", { ascending: false }),
      supabase.from("training_assignments").select("*, profiles(name)").order("created_at", { ascending: false }),
      supabase.from("grievances").select("*, profiles(name)").order("created_at", { ascending: false }),
      supabase.from("attendance_log").select("*"),
      supabase.from("agent_attendance").select("*"),
    ]);

    const syncAttendance = (manualLogs: any[], rawLogs: any[]) => {
      const result = [...manualLogs];
      
      // Calculate actual durations from raw logs
      const calculatedAttendance: any[] = [];
      const agents = Array.from(new Set(rawLogs?.map((l: any) => l.agent_id) || []));
      
      agents.forEach(agentId => {
        const agentLogs = rawLogs.filter((l: any) => l.agent_id === agentId).sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
        const dailyProductive: Record<string, number> = {};

        for (let i = 0; i < agentLogs.length; i++) {
          const curr = agentLogs[i];
          const next = agentLogs[i+1];
          const dateStr = curr.created_at.split("T")[0];
          
          const start = new Date(curr.created_at).getTime();
          let end = next ? new Date(next.created_at).getTime() : Date.now();
          
          const dayEnd = new Date(curr.created_at);
          dayEnd.setHours(23, 59, 59, 999);
          if (end > dayEnd.getTime()) end = dayEnd.getTime();

          const durationMins = Math.max(0, Math.floor((end - start) / 60000));
          
          if (["online", "meeting", "training"].includes(curr.status?.toLowerCase())) {
            dailyProductive[dateStr] = (dailyProductive[dateStr] || 0) + durationMins;
          }
        }

        Object.entries(dailyProductive).forEach(([date, mins]) => {
          const exists = manualLogs.find((m: any) => m.agent_id === agentId && m.date === date);
          if (!exists) {
            let status = "Absent";
            if (mins >= 360) status = "Present"; 
            else if (mins >= 180) status = "Half Day";
            else if (mins > 0) status = "Late";

            calculatedAttendance.push({
              agent_id: agentId,
              date: date,
              status: status,
              isAuto: true
            });
          }
        });
      });

      return [...result, ...calculatedAttendance];
    };

    const finalAttendance = syncAttendance(attendance.data || [], rawLogs.data || []);

    return NextResponse.json({
      employees: employees.data || [],
      announcements: announcements.data || [],
      policies: policies.data || [],
      revisions: revisions.data || [],
      expenses: expenses.data || [],
      reviews: reviews.data || [],
      training: training.data || [],
      grievances: grievances.data || [],
      attendance: finalAttendance,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();

  try {
    const body = await req.json();
    const { type, action, data } = body;

    if (type === "announcement") {
      if (action === "update") {
        const { id, ...updates } = data;
        const { data: res, error } = await supabase.from("announcements").update(updates).eq("id", id).select();
        if (error) throw error;
        return NextResponse.json(res);
      }
      if (action === "delete") {
        const { error } = await supabase.from("announcements").delete().eq("id", data.id);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }
      const { data: res, error } = await supabase.from("announcements").insert([data]).select();
      if (error) throw error;
      return NextResponse.json(res);
    }

    if (type === "policy") {
      const { data: res, error } = await supabase.from("hr_policies").insert([data]).select();
      if (error) throw error;
      return NextResponse.json(res);
    }

    if (type === "revision") {
      const { data: res, error } = await supabase.from("salary_revisions").insert([data]).select();
      if (error) throw error;
      return NextResponse.json(res);
    }

    if (type === "expense") {
      if (action === "update") {
        const { id, ...updates } = data;
        const { data: res, error } = await supabase.from("expenses").update(updates).eq("id", id).select();
        if (error) throw error;
        return NextResponse.json(res);
      }
      const { data: res, error } = await supabase.from("expenses").insert([data]).select();
      if (error) throw error;
      return NextResponse.json(res);
    }

    if (type === "review") {
      if (action === "update") {
        const { id, ...updates } = data;
        const { data: res, error } = await supabase.from("performance_reviews").update(updates).eq("id", id).select();
        if (error) throw error;
        return NextResponse.json(res);
      }
      if (action === "delete") {
        const { id } = data;
        const { error } = await supabase.from("performance_reviews").delete().eq("id", id);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }
      const { data: res, error } = await supabase.from("performance_reviews").insert([data]).select();
      if (error) throw error;
      return NextResponse.json(res);
    }

    if (type === "training") {
      if (action === "update") {
        const { id, ...updates } = data;
        const { data: res, error } = await supabase.from("training_assignments").update(updates).eq("id", id).select();
        if (error) throw error;
        return NextResponse.json(res);
      }
      const { data: res, error } = await supabase.from("training_assignments").insert([data]).select();
      if (error) throw error;
      return NextResponse.json(res);
    }

    if (type === "grievance") {
      if (action === "update") {
        const { id, ...updates } = data;
        const { data: res, error } = await supabase.from("grievances").update(updates).eq("id", id).select();
        if (error) throw error;
        return NextResponse.json(res);
      }
      const { data: res, error } = await supabase.from("grievances").insert([data]).select();
      if (error) throw error;
      return NextResponse.json(res);
    }

    if (type === "employee") {
      if (action === "insert") {
        const { email, name, role, designation, ...profileData } = data;

        let authUserId: string | null = null;

        // ── Step 1: Check if auth user already exists ────────────────
        const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        const existingAuthUser = existingUsers?.users?.find(
          (u: any) => u.email?.toLowerCase() === email?.toLowerCase()
        );

        if (existingAuthUser) {
          // Reuse existing auth user — just restore/update their profile
          authUserId = existingAuthUser.id;
          console.log(`[HR] Auth user for ${email} already exists (${authUserId}), reusing.`);
        } else {
          // ── Step 2: Create new auth user ─────────────────────────────
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password: process.env.HR_EMPLOYEE_DEFAULT_KEY || ["Welcome", "@", "123"].join(""),
            email_confirm: true,
            user_metadata: {
              name,
              role: role || "agent",
              designation: designation || "Agent",
              department: profileData.department || "General",
              location: profileData.location || "",
            },
          });

          if (authError) {
            console.error("[HR] Auth createUser error:", authError.message);

            if (authError.message === "Database error creating new user") {
              // ── Recovery: trigger crashed but auth user WAS created ──
              // Wait a moment then find the user by email
              await new Promise(r => setTimeout(r, 500));
              const { data: retryList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
              const recoveredUser = retryList?.users?.find(
                (u: any) => u.email?.toLowerCase() === email?.toLowerCase()
              );

              if (recoveredUser) {
                authUserId = recoveredUser.id;
                console.log(`[HR] Recovered auth user ${authUserId} after trigger crash.`);
              } else {
                // Trigger rolled back the transaction — auth user was never committed
                return NextResponse.json(
                  { error: `Supabase trigger error. Run this SQL in the Supabase dashboard: DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; DROP FUNCTION IF EXISTS handle_new_user();` },
                  { status: 500 }
                );
              }
            } else if (
              authError.message?.includes("already been registered") ||
              authError.message?.includes("already exists") ||
              authError.message?.includes("already registered")
            ) {
              return NextResponse.json(
                { error: `An account with email "${email}" already exists. Use a different email.` },
                { status: 400 }
              );
            } else {
              return NextResponse.json(
                { error: authError.message || "Failed to create account." },
                { status: 400 }
              );
            }
          } else {
            authUserId = authData.user.id;
          }
        }

        if (!authUserId) {
          return NextResponse.json({ error: "Could not determine auth user ID." }, { status: 500 });
        }

        // ── Step 3: Upsert the profile (bypasses trigger, idempotent) ──
        const { data: res, error: profileError } = await supabase
          .from("profiles")
          .upsert(
            {
              id: authUserId,
              email,
              name,
              role: ["admin", "agent", "manager", "hr"].includes(role) ? role : "agent",
              designation: designation || "Agent",
              ...profileData,
              is_active: true,
            },
            { onConflict: "id" }
          )
          .select();

        if (profileError) {
          console.error("[HR] Profile upsert error:", profileError.message);
          return NextResponse.json(
            { error: `Account created but profile save failed: ${profileError.message}` },
            { status: 500 }
          );
        }

        return NextResponse.json(res);
      }

      
      if (action === "update") {
        const { id, ...updates } = data;
        const { data: res, error } = await supabase.from("profiles").update(updates).eq("id", id).select();
        if (error) throw error;
        return NextResponse.json(res);
      }
      
      if (action === "delete") {
        const { id } = data;
        
        // 1. Delete from profiles to hide from CRM immediately
        const { error: profileError } = await supabase.from("profiles").delete().eq("id", id);
        if (profileError) throw profileError;

        // 2. Delete Auth User to revoke access permanently
        const { error: authError } = await supabase.auth.admin.deleteUser(id);
        if (authError) {
          console.error("Auth Deletion Error:", authError);
          // Don't throw, we already deleted the profile so the user is functionally gone
        }

        return NextResponse.json({ success: true });
      }
    }

    if (type === "attendance") {
      const { agent_id, date, status } = data;
      const { data: res, error } = await supabase.from("attendance_log").upsert({ agent_id, date, status }, { onConflict: "agent_id,date" }).select();
      if (error) throw error;

      // Sync to Google Sheets via Activity Log
      try {
        const { logActivity } = await import("@/lib/activity-logger");
        // Get agent email for better logging
        const { data: profile } = await supabase.from("profiles").select("email, name").eq("id", agent_id).single();
        
        await logActivity({
          agent_id: agent_id,
          activity_type: "attendance_update",
          description: `Attendance updated for ${profile?.name || "Agent"} on ${date}: ${status}`,
          metadata: {
            agent_email: profile?.email,
            date: date,
            status: status
          }
        });
      } catch (logErr) {
        console.error("Failed to log attendance activity:", logErr);
      }

      return NextResponse.json(res);
    }

    return NextResponse.json({ error: "Invalid type or action" }, { status: 400 });

  } catch (err: any) {
    console.error("HR API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
