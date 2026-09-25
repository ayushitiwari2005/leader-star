import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Returns the current user's role, bootstrapping the very first user as super_admin. */
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roles && roles.length > 0) return { role: roles[0].role as string };

    // Bootstrap: if no roles exist at all, the first signed-in user becomes super_admin.
    const { count } = await supabase
      .from("user_roles")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) === 0) {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "super_admin" });
      if (!error) return { role: "super_admin" };
    }
    return { role: null };
  });

export const upsertScore = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        teamId: z.string().uuid(),
        activityId: z.string().uuid(),
        points: z.number().min(0),
        remarks: z.string().max(500).optional(),
        expectedVersion: z.number().int().min(0),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const role = roleRows?.[0]?.role as string | undefined;
    if (role !== "admin" && role !== "super_admin") {
      throw new Error("You do not have score-entry permission.");
    }

    const { data: activity, error: actErr } = await supabase
      .from("activities")
      .select("*")
      .eq("id", data.activityId)
      .single();
    if (actErr || !activity) throw new Error("Invalid activity.");
    if (data.points > activity.max_score) {
      throw new Error(`Score cannot exceed the maximum of ${activity.max_score}.`);
    }
    if (activity.status === "completed" && role !== "super_admin") {
      throw new Error(
        "This activity is completed. Only a super admin can modify its scores.",
      );
    }

    const { data: existing } = await supabase
      .from("scores")
      .select("*")
      .eq("team_id", data.teamId)
      .eq("activity_id", data.activityId)
      .maybeSingle();

    if (existing) {
      // Optimistic concurrency: only update if the version still matches.
      const { data: updated, error: upErr } = await supabase
        .from("scores")
        .update({
          points: data.points,
          remarks: data.remarks ?? existing.remarks,
          entered_by: userId,
          version: existing.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("version", data.expectedVersion)
        .select()
        .maybeSingle();
      if (upErr) throw new Error(upErr.message);
      if (!updated) {
        throw new Error(
          "CONFLICT: This score was updated by another admin. Please refresh and review the latest value.",
        );
      }
      await supabase.from("audit_logs").insert({
        action: "score_update",
        entity_type: "score",
        entity_id: existing.id,
        old_value: { points: existing.points, version: existing.version },
        new_value: { points: data.points, version: existing.version + 1 },
        performed_by: userId,
      });
      return { score: updated, previous: existing.points };
    }

    if (data.expectedVersion !== 0) {
      throw new Error(
        "CONFLICT: This score was updated by another admin. Please refresh and review the latest value.",
      );
    }
    const { data: inserted, error: insErr } = await supabase
      .from("scores")
      .insert({
        team_id: data.teamId,
        activity_id: data.activityId,
        points: data.points,
        remarks: data.remarks ?? null,
        entered_by: userId,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    await supabase.from("audit_logs").insert({
      action: "score_create",
      entity_type: "score",
      entity_id: inserted.id,
      old_value: null,
      new_value: { points: data.points },
      performed_by: userId,
    });
    return { score: inserted, previous: null };
  });

export const updateActivity = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["upcoming", "live", "completed"]).optional(),
        maxScore: z.number().int().min(1).optional(),
        weight: z.number().min(0).optional(),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: before } = await supabase
      .from("activities")
      .select("*")
      .eq("id", data.id)
      .single();
    const patch: Record<string, unknown> = {};
    if (data.status) patch.status = data.status;
    if (data.maxScore !== undefined) patch.max_score = data.maxScore;
    if (data.weight !== undefined) patch.weight = data.weight;
    const { error } = await supabase.from("activities").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      action: "activity_update",
      entity_type: "activity",
      entity_id: data.id,
      old_value: before,
      new_value: patch,
      performed_by: userId,
    });
    return { ok: true };
  });

export const updateTeam = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        id: z.string().uuid(),
        currentCapital: z.number().min(0).optional(),
        acquiredBusiness: z.string().max(200).nullable().optional(),
        status: z.enum(["active", "idle", "eliminated"]).optional(),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: before } = await supabase
      .from("teams")
      .select("*")
      .eq("id", data.id)
      .single();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.currentCapital !== undefined) patch.current_capital = data.currentCapital;
    if (data.acquiredBusiness !== undefined) patch.acquired_business = data.acquiredBusiness;
    if (data.status) patch.status = data.status;
    const { error } = await supabase.from("teams").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      action: "team_update",
      entity_type: "team",
      entity_id: data.id,
      old_value: before
        ? { current_capital: before.current_capital, status: before.status }
        : null,
      new_value: patch,
      performed_by: userId,
    });
    return { ok: true };
  });

export const getAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { logs: data };
  });
