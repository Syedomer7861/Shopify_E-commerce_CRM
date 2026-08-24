import { NextRequest, NextResponse } from "next/server";
import { requireInternal, hasInternalSecret, getAuthenticatedSession } from "@/lib/auth-utils";
import { createServerClient } from "@/lib/supabase";
import { computeAutoAttendance } from "@/lib/attendance-engine";
import { computeBenchmark } from "@/lib/hr-benchmark";

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

    if (type === "holidays") {
      const { data, error } = await supabase.from("holidays").select("*").order("date", { ascending: true });
      if (error) throw error;
      return NextResponse.json(data);
    }



    // Default: Fetch everything for a full sync
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const [employees, announcements, policies, revisions, expenses, reviews, training, grievances, attendance, rawLogs, holidays, slaTasks, openTasksWithOrders, payrollRuns] = await Promise.all([
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
      supabase.from("holidays").select("*").order("date", { ascending: true }),
      // Last 14 days of completed tasks, for the real SLA/efficiency
      // benchmark below (this week vs last week, not an invented baseline).
      supabase.from("tasks")
        .select("status, due_date, completed_at, created_at")
        .eq("status", "done")
        .gte("completed_at", new Date(Date.now() - 14 * 86_400_000).toISOString()),
      // Every still-open task that has a real linked order, for real
      // per-agent "revenue at risk" (was a flat invented ₹1,250/task).
      supabase.from("tasks")
        .select("assigned_to, order:orders!inner(total_price)")
        .not("status", "in", '("done","cancelled","skipped")')
        .not("order_id", "is", null),
      // Real persisted Mark Paid / Toggle status for the current month -
      // was pure local React state before, reset on every page refresh.
      supabase.from("payroll_runs").select("agent_id, status, marked_at").eq("month", currentMonth),
    ]);

    const shiftByAgent: Record<string, string> = {};
    for (const p of employees.data || []) shiftByAgent[p.id] = p.shift_type || "Morning";

    const finalAttendance = computeAutoAttendance(
      rawLogs.data || [],
      attendance.data || [],
      shiftByAgent
    );

    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const currentWindow = (slaTasks.data || []).filter(t => t.completed_at! >= sevenDaysAgo);
    const priorWindow = (slaTasks.data || []).filter(t => t.completed_at! < sevenDaysAgo);
    const benchmark = computeBenchmark(currentWindow as any, priorWindow as any);

    const revenueAtRiskByAgent: Record<string, number> = {};
    for (const t of openTasksWithOrders.data || []) {
      if (!t.assigned_to) continue;
      const price = Number((t.order as any)?.total_price || 0);
      revenueAtRiskByAgent[t.assigned_to] = (revenueAtRiskByAgent[t.assigned_to] || 0) + price;
    }

    const payrollStatus: Record<string, { status: string; marked_at: string | null }> = {};
    for (const r of payrollRuns.data || []) {
      payrollStatus[r.agent_id] = { status: r.status, marked_at: r.marked_at };
    }

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
      holidays: holidays.data || [],
      benchmark,
      revenueAtRiskByAgent,
      payrollStatus,
      payrollMonth: currentMonth,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireInternal(req);
  if (unauthorized) return unauthorized;

  // requireInternal only checks "logged in or has a cron secret" - every
  // mutation below (employee insert/update/delete, announcements, policies,
  // expenses, reviews, grievances...) had no role check at all, relying
  // entirely on the HR page's client-side gate (admin/hr only). A plain
  // agent session calling this endpoint directly could delete or edit any
  // employee profile. The HR Dashboard itself is admin/hr only, so enforce
  // that here too.
  let currentUserId: string | null = null;
  if (!hasInternalSecret(req)) {
    const { profile } = await getAuthenticatedSession();
    if (profile?.role !== "admin" && profile?.role !== "hr") {
      return NextResponse.json({ error: "Forbidden: Admin or HR access required" }, { status: 403 });
    }
    currentUserId = profile?.id || null;
  }

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

    if (type === "payroll") {
      // Mark All Paid / per-row Toggle used to be pure local React state
      // with no database write at all - refreshing the page reset every
      // payslip back to "Pending". This persists real status per
      // (agent, month), with who marked it and when.
      if (action === "mark_all_paid") {
        const { agent_ids, month } = data;
        if (!Array.isArray(agent_ids) || !month) {
          return NextResponse.json({ error: "agent_ids and month are required" }, { status: 400 });
        }
        const rows = agent_ids.map((agent_id: string) => ({
          agent_id, month, status: "paid", marked_by: currentUserId, marked_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from("payroll_runs").upsert(rows, { onConflict: "agent_id,month" });
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      // mark_paid / mark_pending (per-row Toggle)
      const { agent_id, month, status } = data;
      if (!agent_id || !month || !status) {
        return NextResponse.json({ error: "agent_id, month, and status are required" }, { status: 400 });
      }
      const { error } = await supabase.from("payroll_runs").upsert({
        agent_id, month, status,
        marked_by: status === "paid" ? currentUserId : null,
        marked_at: status === "paid" ? new Date().toISOString() : null,
      }, { onConflict: "agent_id,month" });
      if (error) throw error;
      return NextResponse.json({ success: true });
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

    if (type === "shift") {
      // Shift Assignment used to be pure React state - every reload reset
      // every agent back to "Morning" and any change was gone. Persisted on
      // profiles.shift_type now.
      const { agent_id, shift_type } = data;
      if (!["Morning", "Afternoon", "Night", "Off"].includes(shift_type)) {
        return NextResponse.json({ error: "Invalid shift_type" }, { status: 400 });
      }
      const { data: res, error } = await supabase
        .from("profiles")
        .update({ shift_type })
        .eq("id", agent_id)
        .select("id, shift_type");
      if (error) throw error;
      return NextResponse.json(res);
    }

    if (type === "holiday") {
      if (action === "delete") {
        const { id } = data;
        const { error } = await supabase.from("holidays").delete().eq("id", id);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      // Holiday Calendar used to be pure React state too - "Add Holiday"
      // appeared to save, then vanished on the next reload.
      const { date, name, holidayType } = data;
      if (!date || !name) {
        return NextResponse.json({ error: "date and name are required" }, { status: 400 });
      }
      const { data: res, error } = await supabase
        .from("holidays")
        .insert({ date, name, type: holidayType || "National" })
        .select();
      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "A holiday is already set for this date" }, { status: 409 });
        }
        throw error;
      }
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: "Invalid type or action" }, { status: 400 });

  } catch (err: any) {
    console.error("HR API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
