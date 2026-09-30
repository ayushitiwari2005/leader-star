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
    const firstRole = roles?.[0];
    if (firstRole) return { role: firstRole.role as string };

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
    const patch: { status?: string; max_score?: number; weight?: number } = {};
    if (data.status) patch.status = data.status;
    if (data.maxScore !== undefined) patch.max_score = data.maxScore;
    if (data.weight !== undefined) patch.weight = data.weight;
    const { error } = await supabase.from("activities").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      action: "activity_update",
      entity_type: "activity",
      entity_id: data.id,
      old_value: before ? JSON.parse(JSON.stringify(before)) : null,
      new_value: JSON.parse(JSON.stringify(patch)),
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
    const patch: {
      updated_at: string;
      current_capital?: number;
      acquired_business?: string | null;
      status?: string;
    } = { updated_at: new Date().toISOString() };
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
      new_value: JSON.parse(JSON.stringify(patch)),
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

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const role = data?.[0]?.role as string | undefined;
  if (role !== "admin" && role !== "super_admin") throw new Error("You do not have permission.");
}

async function assertUniqueName(supabase: any, name: string, exceptId?: string) {
  const { data } = await supabase.from("teams").select("id").ilike("name", name.replace(/[%_\\]/g, "\\$&"));
  if ((data ?? []).some((r: { id: string }) => r.id !== exceptId)) {
    throw new Error(`A team named "${name}" already exists.`);
  }
}

const teamName = z.string().trim().min(1, "Team name is required.").max(100);

export const createTeam = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ name: teamName }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    await assertUniqueName(supabase, data.name);
    const { data: codes } = await supabase.from("teams").select("team_code");
    const max = (codes ?? []).reduce((m, r) => {
      const n = parseInt(String(r.team_code).replace(/\D/g, ""), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const code = `T${String(max + 1).padStart(2, "0")}`;
    const { data: team, error } = await supabase
      .from("teams")
      .insert({ name: data.name, team_code: code })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      action: "team_create", entity_type: "team", entity_id: team.id,
      old_value: null, new_value: { name: data.name, team_code: code }, performed_by: userId,
    });
    return { team };
  });

export const renameTeam = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid(), name: teamName }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    await assertUniqueName(supabase, data.name, data.id);
    const { data: before } = await supabase.from("teams").select("name").eq("id", data.id).single();
    const { error } = await supabase
      .from("teams")
      .update({ name: data.name, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      action: "team_rename", entity_type: "team", entity_id: data.id,
      old_value: before ? { name: before.name } : null, new_value: { name: data.name }, performed_by: userId,
    });
    return { ok: true };
  });

export const deleteTeam = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: before } = await supabase.from("teams").select("*").eq("id", data.id).single();
    const { count } = await supabase.from("scores").select("id", { count: "exact", head: true }).eq("team_id", data.id);
    const { error: sErr } = await supabase.from("scores").delete().eq("team_id", data.id);
    if (sErr) throw new Error(sErr.message);
    const { error } = await supabase.from("teams").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      action: "team_delete", entity_type: "team", entity_id: data.id,
      old_value: before ? { name: before.name, team_code: before.team_code, scores_removed: count ?? 0 } : null,
      new_value: null, performed_by: userId,
    });
    return { ok: true };
  });
