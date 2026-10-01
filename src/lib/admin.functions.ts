import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Sb = SupabaseClient<Database>;
const CONFLICT =
  "CONFLICT: This score was changed by another admin. Please review the latest value and try again.";

/** Admin = signed-in account with a verified email (checked in the database). */
async function getRole(supabase: Sb, userId: string): Promise<string | null> {
  const { data } = await supabase.rpc("is_admin", { _user_id: userId });
  return data ? "admin" : null;
}

async function assertAdmin(supabase: Sb, userId: string) {
  const role = await getRole(supabase, userId);
  if (role !== "admin") throw new Error("Please verify your email before using the Admin Panel.");
  // All verified admins have equal permissions.
  return "super_admin";
}

async function names(supabase: Sb, teamId: string, activityId: string) {
  const [t, a] = await Promise.all([
    supabase.from("teams").select("name").eq("id", teamId).maybeSingle(),
    supabase.from("activities").select("name").eq("id", activityId).maybeSingle(),
  ]);
  return { team_name: t.data?.name ?? "Unknown team", activity_name: a.data?.name ?? "Unknown activity" };
}

async function logScore(
  supabase: Sb,
  userId: string,
  action: "score_create" | "score_update" | "score_delete" | "score_rollback",
  scoreId: string,
  teamId: string,
  activityId: string,
  oldPoints: number | null,
  newPoints: number | null,
  extra: Record<string, unknown> = {},
) {
  const n = await names(supabase, teamId, activityId);
  const base = { team_id: teamId, activity_id: activityId, ...n };
  await supabase.from("audit_logs").insert({
    action,
    entity_type: "score",
    entity_id: scoreId,
    old_value: oldPoints === null ? null : { ...base, points: oldPoints },
    new_value: newPoints === null ? { ...base, points: null, ...extra } : { ...base, points: newPoints, ...extra },
    performed_by: userId,
  });
}

/** Writes a score (create / update / delete when points === null) with optimistic concurrency. */
async function writeScore(
  supabase: Sb,
  userId: string,
  role: string,
  teamId: string,
  activityId: string,
  points: number | null,
  expectedVersion: number,
  remarks?: string,
) {
  const { data: activity } = await supabase.from("activities").select("*").eq("id", activityId).maybeSingle();
  if (!activity) throw new Error("This activity no longer exists.");
  if (activity.status === "disabled") throw new Error("This activity is disabled. Enable it before scoring.");
  if (activity.status === "completed" && role !== "super_admin")
    throw new Error("This activity is completed. Only a super admin can change its scores.");
  if (points !== null) {
    if (points < 0) throw new Error("Score cannot be negative.");
    if (points > activity.max_score) throw new Error(`Score cannot exceed the maximum of ${activity.max_score}.`);
  }
  const { data: team } = await supabase.from("teams").select("id").eq("id", teamId).maybeSingle();
  if (!team) throw new Error("This team no longer exists.");

  const { data: existing } = await supabase
    .from("scores")
    .select("*")
    .eq("team_id", teamId)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (existing && existing.version !== expectedVersion) throw new Error(CONFLICT);
  if (!existing && expectedVersion !== 0) throw new Error(CONFLICT);

  if (points === null) {
    if (!existing) throw new Error("There is no score to delete.");
    const { data: gone, error } = await supabase
      .from("scores")
      .delete()
      .eq("id", existing.id)
      .eq("version", expectedVersion)
      .select();
    if (error) throw new Error(error.message);
    if (!gone?.length) throw new Error(CONFLICT);
    return { existing, score: null };
  }

  if (existing) {
    const { data: updated, error } = await supabase
      .from("scores")
      .update({
        points,
        remarks: remarks ?? existing.remarks,
        entered_by: userId,
        version: existing.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("version", expectedVersion)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error(CONFLICT);
    return { existing, score: updated };
  }

  const { data: inserted, error } = await supabase
    .from("scores")
    .insert({ team_id: teamId, activity_id: activityId, points, remarks: remarks ?? null, entered_by: userId })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(CONFLICT);
    throw new Error(error.message);
  }
  return { existing: null, score: inserted };
}

/* ---------------- Roles ---------------- */

/** Returns "admin" when the signed-in account's email is verified, otherwise null. */
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    return { role: await getRole(supabase, userId) };
  });

/* ---------------- Scores ---------------- */

export const upsertScore = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        teamId: z.string().uuid(),
        activityId: z.string().uuid(),
        points: z.number().finite().min(0, "Score cannot be negative."),
        remarks: z.string().max(500).optional(),
        expectedVersion: z.number().int().min(0),
      })
      .parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const role = await assertAdmin(supabase, userId);
    const { existing, score } = await writeScore(
      supabase, userId, role, data.teamId, data.activityId, data.points, data.expectedVersion, data.remarks,
    );
    if (existing && existing.points === data.points) return { score, previous: existing.points, unchanged: true };
    await logScore(
      supabase, userId, existing ? "score_update" : "score_create", score!.id,
      data.teamId, data.activityId, existing?.points ?? null, data.points,
    );
    return { score, previous: existing?.points ?? null, unchanged: false };
  });

export const deleteScore = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ teamId: z.string().uuid(), activityId: z.string().uuid(), expectedVersion: z.number().int().min(1) }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const role = await assertAdmin(supabase, userId);
    const { existing } = await writeScore(supabase, userId, role, data.teamId, data.activityId, null, data.expectedVersion);
    await logScore(supabase, userId, "score_delete", existing!.id, data.teamId, data.activityId, existing!.points, null);
    return { ok: true };
  });

/** Reverts one history entry: restores the "previous" value, provided the score hasn't changed since. */
export const rollbackScore = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ logId: z.string().uuid() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const role = await assertAdmin(supabase, userId);
    const { data: log } = await supabase.from("audit_logs").select("*").eq("id", data.logId).maybeSingle();
    if (!log || log.entity_type !== "score") throw new Error("History entry not found.");
    const oldV = (log.old_value ?? null) as { team_id?: string; activity_id?: string; points?: number | null } | null;
    const newV = (log.new_value ?? null) as { team_id?: string; activity_id?: string; points?: number | null } | null;
    const teamId = newV?.team_id ?? oldV?.team_id;
    const activityId = newV?.activity_id ?? oldV?.activity_id;
    if (!teamId || !activityId) throw new Error("This older history entry cannot be rolled back.");
    const target = oldV?.points ?? null; // value to restore
    const expectedNow = newV?.points ?? null; // value the change produced

    const { data: current } = await supabase
      .from("scores").select("*").eq("team_id", teamId).eq("activity_id", activityId).maybeSingle();
    const currentPoints = current ? Number(current.points) : null;
    if ((currentPoints === null ? null : currentPoints) !== (expectedNow === null ? null : Number(expectedNow))) {
      throw new Error(
        "This score has changed since that entry. Roll back the most recent change for this team and activity instead.",
      );
    }
    if (target === null && !current) throw new Error("Nothing to roll back.");

    const { existing, score } = await writeScore(
      supabase, userId, role, teamId, activityId, target === null ? null : Number(target), current?.version ?? 0,
    );
    await logScore(
      supabase, userId, "score_rollback", score?.id ?? existing?.id ?? log.entity_id ?? "",
      teamId, activityId, existing?.points ?? null, target === null ? null : Number(target),
      { rolled_back_log: log.id },
    );
    return { ok: true, restored: target };
  });

export const getScoreHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const ids = [...new Set((data ?? []).map((l) => l.performed_by).filter(Boolean))] as string[];
    const emails: Record<string, string> = {};
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      for (const u of users?.users ?? []) if (ids.includes(u.id)) emails[u.id] = u.email ?? u.id;
    }
    return {
      logs: (data ?? []).map((l) => ({
        ...l,
        performer: l.performed_by ? (emails[l.performed_by] ?? "Unknown") : "System",
      })),
    };
  });

/* ---------------- Teams ---------------- */

async function assertUniqueName(supabase: Sb, name: string, exceptId?: string) {
  const { data } = await supabase.from("teams").select("id, name");
  const n = name.trim().toLowerCase();
  if ((data ?? []).some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === n)) {
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
    const { data: team, error } = await supabase.from("teams").insert({ name: data.name, team_code: code }).select().single();
    if (error) {
      if (error.code === "23505") throw new Error(`A team named "${data.name}" already exists.`);
      throw new Error(error.message);
    }
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
    const { error } = await supabase.from("teams").update({ name: data.name, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) {
      if (error.code === "23505") throw new Error(`A team named "${data.name}" already exists.`);
      throw new Error(error.message);
    }
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
    const { error } = await supabase.from("teams").delete().eq("id", data.id); // scores cascade
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      action: "team_delete", entity_type: "team", entity_id: data.id,
      old_value: before ? { name: before.name, team_code: before.team_code, scores_removed: count ?? 0 } : null,
      new_value: null, performed_by: userId,
    });
    return { ok: true };
  });

/* ---------------- Activities ---------------- */

const activityStatus = z.enum(["upcoming", "live", "completed", "disabled"]);

export const createActivity = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      name: z.string().trim().min(1, "Activity name is required.").max(100),
      maxScore: z.number().int().min(1, "Maximum score must be at least 1.").max(100000),
    }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: all } = await supabase.from("activities").select("name, sort_order");
    if ((all ?? []).some((a) => a.name.trim().toLowerCase() === data.name.toLowerCase()))
      throw new Error(`An activity named "${data.name}" already exists.`);
    const nextOrder = Math.max(0, ...(all ?? []).map((a) => a.sort_order)) + 1;
    const { data: act, error } = await supabase
      .from("activities")
      .insert({ name: data.name, max_score: data.maxScore, sort_order: nextOrder, status: "upcoming" })
      .select().single();
    if (error) throw new Error(error.code === "23505" ? `An activity named "${data.name}" already exists.` : error.message);
    await supabase.from("audit_logs").insert({
      action: "activity_create", entity_type: "activity", entity_id: act.id,
      old_value: null, new_value: { name: data.name, max_score: data.maxScore }, performed_by: userId,
    });
    return { activity: act };
  });

export const updateActivity = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(100).optional(),
      status: activityStatus.optional(),
      maxScore: z.number().int().min(1).max(100000).optional(),
      weight: z.number().min(0).optional(),
    }).parse(data),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const role = await assertAdmin(supabase, userId);
    const { data: before } = await supabase.from("activities").select("*").eq("id", data.id).single();
    if (!before) throw new Error("Activity not found.");
    if (before.status === "completed" && role !== "super_admin" && (data.maxScore !== undefined || data.status))
      throw new Error("Only a super admin can change a completed activity.");
    if (data.maxScore !== undefined) {
      const { data: over } = await supabase.from("scores").select("id").eq("activity_id", data.id).gt("points", data.maxScore).limit(1);
      if (over?.length) throw new Error("Some teams already scored above that maximum. Lower their scores first.");
    }
    if (data.name) {
      const { data: all } = await supabase.from("activities").select("id, name");
      if ((all ?? []).some((a) => a.id !== data.id && a.name.trim().toLowerCase() === data.name!.toLowerCase()))
        throw new Error(`An activity named "${data.name}" already exists.`);
    }
    const patch: { name?: string; status?: string; max_score?: number; weight?: number } = {};
    if (data.name) patch.name = data.name;
    if (data.status) patch.status = data.status;
    if (data.maxScore !== undefined) patch.max_score = data.maxScore;
    if (data.weight !== undefined) patch.weight = data.weight;
    const { error } = await supabase.from("activities").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      action: "activity_update", entity_type: "activity", entity_id: data.id,
      old_value: { name: before.name, status: before.status, max_score: before.max_score, weight: before.weight },
      new_value: JSON.parse(JSON.stringify(patch)), performed_by: userId,
    });
    return { ok: true };
  });

export const deleteActivity = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const role = await assertAdmin(supabase, userId);
    const { data: before } = await supabase.from("activities").select("*").eq("id", data.id).single();
    if (!before) throw new Error("Activity not found.");
    if (before.status === "completed" && role !== "super_admin")
      throw new Error("Only a super admin can delete a completed activity.");
    const { count } = await supabase.from("scores").select("id", { count: "exact", head: true }).eq("activity_id", data.id);
    const { error } = await supabase.from("activities").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      action: "activity_delete", entity_type: "activity", entity_id: data.id,
      old_value: { name: before.name, max_score: before.max_score, scores_removed: count ?? 0 },
      new_value: null, performed_by: userId,
    });
    return { ok: true };
  });

