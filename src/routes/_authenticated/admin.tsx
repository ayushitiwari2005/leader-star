import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  ClipboardList,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  ShieldCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import {
  createActivity,
  createTeam,
  deleteActivity,
  deleteScore,
  deleteTeam,
  getMyRole,
  getScoreHistory,
  listAdmins,
  removeAdmin,
  renameTeam,
  rollbackScore,
  setAdminRole,
  updateActivity,
  upsertScore,
} from "@/lib/admin.functions";
import { formatScore, formatTime, type Activity, type Score, type Team } from "@/lib/leaderboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import emblem from "@/assets/reference-emblem.webp.asset.json";
import wordmark from "@/assets/reference-wordmark.webp.asset.json";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — BIZZNNOVATE" },
      { name: "description", content: "Teams, activities, score management and score history for BIZZNNOVATE." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Section = "dashboard" | "teams" | "activities" | "scores" | "history" | "admins";

const NAV: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "teams", label: "Teams", icon: Users },
  { id: "activities", label: "Activities", icon: ActivityIcon },
  { id: "scores", label: "Score Management", icon: ClipboardList },
  { id: "history", label: "Score History", icon: History },
  { id: "admins", label: "Admin Users", icon: ShieldCheck },
];

type HistoryLog = Awaited<ReturnType<typeof getScoreHistory>>["logs"][number];

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/* ---------- shared UI ---------- */

const panel = "border border-line/40 bg-ink-2/80";
const th = "px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground";
const td = "px-3 py-2.5 text-sm";
const btnEdit = "h-9 border border-primary/40 bg-transparent px-3 text-xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/10";
const btnDelete = "h-9 border border-down/40 bg-transparent px-3 text-xs font-semibold uppercase tracking-wider text-down hover:bg-down/10";
const btnSave = "h-9 bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary-foreground hover:bg-primary/90";
const btnRollback = "h-9 border border-gold/50 bg-transparent px-3 text-xs font-semibold uppercase tracking-wider text-gold hover:bg-gold/10";

function Confirm(props: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  busy: boolean;
  tone?: "danger" | "warn";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={props.open} onOpenChange={(o) => !o && !props.busy && props.onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">{props.description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={props.busy}
            onClick={(e) => {
              e.preventDefault();
              props.onConfirm();
            }}
            className={props.tone === "warn" ? "bg-gold text-primary-foreground hover:bg-gold/90" : "bg-down text-primary-foreground hover:bg-down/90"}
          >
            {props.busy ? "Working…" : props.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["leaderboard"] }),
      qc.invalidateQueries({ queryKey: ["score-history"] }),
    ]);
}

/* ---------- page ---------- */

function AdminPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("dashboard");
  const lb = useLeaderboard();
  const { teams, allActivities: activities, scores, standings, lastUpdated } = lb;

  const roleQuery = useQuery({ queryKey: ["my-role"], queryFn: () => getMyRole() });
  const role = roleQuery.data?.role ?? null;
  const canEdit = role === "admin" || role === "super_admin";
  const isSuper = role === "super_admin";

  const historyQuery = useQuery({
    queryKey: ["score-history"],
    queryFn: () => getScoreHistory(),
    enabled: canEdit,
    refetchInterval: 15000,
  });
  const logs = historyQuery.data?.logs ?? [];

  const totals = useMemo(() => new Map(standings.map((s) => [s.team.id, s])), [standings]);

  const signOut = async () => {
    await supabase.auth.signOut();
    void navigate({ to: "/" });
  };

  if (roleQuery.isLoading) {
    return <div className="grid min-h-screen place-items-center font-mono text-sm text-muted-foreground">Checking access…</div>;
  }
  if (!canEdit) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className={cn(panel, "max-w-md p-8 text-center")}>
          <img src={emblem.url} alt="BIZZNNOVATE emblem" className="mx-auto size-14 object-contain" />
          <h1 className="mt-4 font-heading text-2xl">No admin access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This account can’t edit the leaderboard. Ask a super admin to add you under Admin Users.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild variant="outline"><Link to="/">View leaderboard</Link></Button>
            <Button onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line/50 bg-ink-2/80 p-4 md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-2">
          <img src={emblem.url} alt="BIZZNNOVATE emblem" className="size-10 object-contain" />
          <div className="min-w-0">
            <img src={wordmark.url} alt="BIZZNNOVATE" className="h-auto w-30 object-contain object-left" />
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-primary">Admin Console</div>
          </div>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto md:mt-8 md:block md:space-y-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors md:w-full md:gap-3",
                section === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-ink-3/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-3 flex gap-2 md:mt-auto md:block md:space-y-1">
          <Link to="/" className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:bg-ink-3/60 hover:text-foreground md:w-full">
            <ListChecks className="size-4" /> Public leaderboard
          </Link>
          <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:bg-ink-3/60 hover:text-down md:w-full">
            <LogOut className="size-4" /> Logout
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="font-heading text-3xl font-semibold tracking-wide">{NAV.find((n) => n.id === section)?.label}</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Role: {role?.replace("_", " ")} · Updated {lastUpdated ? formatTime(lastUpdated) : "—"}
          </p>
        </div>

        {lb.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading data…</p>
        ) : (
          <>
            {section === "dashboard" && (
              <Dashboard teams={teams} activities={activities} scores={scores} lastUpdated={lastUpdated} logs={logs} />
            )}
            {section === "teams" && <TeamsSection teams={teams} totals={totals} />}
            {section === "activities" && <ActivitiesSection activities={activities} scores={scores} isSuper={isSuper} />}
            {section === "scores" && <ScoresSection teams={teams} activities={activities} scores={scores} isSuper={isSuper} />}
            {section === "history" && <HistorySection logs={logs} loading={historyQuery.isLoading} />}
            {section === "admins" && <AdminsSection isSuper={isSuper} />}
          </>
        )}
      </main>
    </div>
  );
}

/* ---------- dashboard ---------- */

const ACTION_LABEL: Record<string, string> = {
  score_create: "Created",
  score_update: "Updated",
  score_delete: "Deleted",
  score_rollback: "Rolled back",
  team_create: "Team added",
  team_rename: "Team renamed",
  team_delete: "Team deleted",
  team_update: "Team updated",
  activity_create: "Activity added",
  activity_update: "Activity updated",
  activity_delete: "Activity deleted",
  role_set: "Role set",
  role_remove: "Role removed",
};

type ScoreVal = { team_name?: string; activity_name?: string; points?: number | null; name?: string; email?: string; role?: string } | null;

function describe(l: HistoryLog) {
  const o = l.old_value as ScoreVal;
  const n = l.new_value as ScoreVal;
  if (l.entity_type === "score") {
    const team = n?.team_name ?? o?.team_name ?? "Team";
    const act = n?.activity_name ?? o?.activity_name ?? "Activity";
    const from = o?.points ?? null;
    const to = n?.points ?? null;
    return `${team} · ${act} · ${from === null ? "—" : formatScore(from)} → ${to === null ? "—" : formatScore(to)}`;
  }
  if (l.entity_type === "team") {
    if (l.action === "team_rename") return `${o?.name} → ${n?.name}`;
    return n?.name ?? o?.name ?? "Team";
  }
  if (l.entity_type === "activity") return n?.name ?? o?.name ?? "Activity";
  if (l.entity_type === "user") return n?.email ? `${n.email} (${n.role})` : "User";
  return "";
}

function Dashboard(props: { teams: Team[]; activities: Activity[]; scores: Score[]; lastUpdated: Date | null; logs: HistoryLog[] }) {
  const cards = [
    { label: "Total Teams", value: String(props.teams.length) },
    { label: "Total Activities", value: String(props.activities.length) },
    { label: "Score Entries", value: String(props.scores.length) },
    { label: "Last Updated", value: props.lastUpdated ? formatTime(props.lastUpdated) : "—" },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={cn(panel, "p-4")}>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{c.label}</div>
            <div className="mt-2 truncate font-display text-3xl">{c.value}</div>
          </div>
        ))}
      </div>
      <div className={panel}>
        <div className="border-b border-line/40 px-4 py-3 font-heading text-lg">Recent Activity</div>
        {props.logs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No changes yet.</p>
        ) : (
          <ul className="divide-y divide-line/40">
            {props.logs.slice(0, 10).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="w-16 font-mono text-xs text-muted-foreground">{formatTime(new Date(l.created_at))}</span>
                <span className="font-semibold">{ACTION_LABEL[l.action] ?? l.action}</span>
                <span className="min-w-0 flex-1 truncate">{describe(l)}</span>
                <span className="text-xs text-muted-foreground">{l.performer}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------- teams ---------- */

function TeamsSection({ teams, totals }: { teams: Team[]; totals: Map<string, { total: number; rank: number }> }) {
  const refresh = useRefresh();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Team | null>(null);
  const [busy, setBusy] = useState(false);

  const isDup = (name: string, exceptId?: string) =>
    teams.some((t) => t.id !== exceptId && t.name.trim().toLowerCase() === name.trim().toLowerCase());

  const add = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (adding) return;
    const name = newName.trim();
    if (!name) { toast.error("Team name is required."); return; }
    if (isDup(name)) { toast.error(`A team named "${name}" already exists.`); return; }
    setAdding(true);
    try {
      await createTeam({ data: { name } });
      toast.success("Team added successfully.");
      setNewName("");
      await refresh();
    } catch (err) {
      toast.error(errMsg(err, "Failed to add team. Please try again."));
    } finally {
      setAdding(false);
    }
  };

  const saveName = async (id: string) => {
    if (saving) return;
    const name = editName.trim();
    if (!name) { toast.error("Team name is required."); return; }
    if (isDup(name, id)) { toast.error(`A team named "${name}" already exists.`); return; }
    setSaving(true);
    try {
      await renameTeam({ data: { id, name } });
      toast.success("Team renamed successfully.");
      setEditing(null);
      await refresh();
    } catch (err) {
      toast.error(errMsg(err, "Failed to rename team. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteTeam({ data: { id: toDelete.id } });
      toast.success("Team deleted successfully.");
      setToDelete(null);
      await refresh();
    } catch (err) {
      toast.error(errMsg(err, "Failed to delete team. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = (q ? teams.filter((t) => t.name.toLowerCase().includes(q)) : teams)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <form onSubmit={add} className={cn(panel, "flex flex-col gap-3 p-4 sm:flex-row sm:items-end")}>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="new-team">Team Name</Label>
          <Input id="new-team" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Enter team name" maxLength={100} className="h-11 border-line bg-ink-3/60" />
        </div>
        <Button type="submit" disabled={adding} className={cn(btnSave, "h-11 px-6")}>{adding ? "Adding…" : "Add Team"}</Button>
      </form>

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${teams.length} teams…`} className="h-11 border-line bg-ink-2/80" />

      <div className={cn(panel, "overflow-x-auto")}>
        <table className="w-full min-w-[520px]">
          <thead className="border-b border-line">
            <tr><th className={th}>Team Name</th><th className={cn(th, "text-right")}>Total Score</th><th className={cn(th, "text-right")}>Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">No teams found.</td></tr>
            )}
            {filtered.map((t) => (
              <tr key={t.id}>
                <td className={td}>
                  {editing === t.id ? (
                    <Input
                      autoFocus value={editName} maxLength={100}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveName(t.id); if (e.key === "Escape") setEditing(null); }}
                      className="h-9 border-line bg-ink-3/60"
                    />
                  ) : (
                    <span className="font-medium">{t.name}</span>
                  )}
                </td>
                <td className={cn(td, "text-right font-mono")}>
                  {formatScore(totals.get(t.id)?.total ?? 0)}
                  <span className="ml-2 text-xs text-muted-foreground">#{totals.get(t.id)?.rank ?? "—"}</span>
                </td>
                <td className={cn(td, "text-right")}>
                  <div className="flex justify-end gap-2">
                    {editing === t.id ? (
                      <>
                        <Button disabled={saving} onClick={() => void saveName(t.id)} className={btnSave}>{saving ? "Saving…" : "Save"}</Button>
                        <Button variant="ghost" onClick={() => setEditing(null)} className="h-9">Cancel</Button>
                      </>
                    ) : (
                      <>
                        <Button onClick={() => { setEditing(t.id); setEditName(t.name); }} className={btnEdit}>Edit</Button>
                        <Button onClick={() => setToDelete(t)} className={btnDelete}>Delete</Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Confirm
        open={!!toDelete} busy={busy} confirmLabel="Delete Team"
        title={`Delete "${toDelete?.name}"?`}
        description={<>This permanently removes the team and <strong>all of its scores</strong> in every activity. The leaderboard will be re-ranked. The change stays in Score History.</>}
        onCancel={() => setToDelete(null)} onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

/* ---------- activities ---------- */

const STATUSES = ["upcoming", "live", "completed", "disabled"] as const;

function ActivitiesSection({ activities, scores, isSuper }: { activities: Activity[]; scores: Score[]; isSuper: boolean }) {
  const refresh = useRefresh();
  const [name, setName] = useState("");
  const [max, setMax] = useState("100");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMax, setEditMax] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of scores) m.set(s.activity_id, (m.get(s.activity_id) ?? 0) + 1);
    return m;
  }, [scores]);

  const add = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (adding) return;
    const n = name.trim();
    const m = Number(max);
    if (!n) { toast.error("Activity name is required."); return; }
    if (!Number.isInteger(m) || m < 1) { toast.error("Maximum score must be a whole number of at least 1."); return; }
    setAdding(true);
    try {
      await createActivity({ data: { name: n, maxScore: m } });
      toast.success("Activity added successfully.");
      setName(""); setMax("100");
      await refresh();
    } catch (err) {
      toast.error(errMsg(err, "Failed to add activity. Please try again."));
    } finally {
      setAdding(false);
    }
  };

  const update = async (a: Activity, patch: { name?: string; maxScore?: number; status?: (typeof STATUSES)[number] }, msg: string) => {
    setBusyId(a.id);
    try {
      await updateActivity({ data: { id: a.id, ...patch } });
      toast.success(msg);
      setEditing(null);
      await refresh();
    } catch (err) {
      toast.error(errMsg(err, "Failed to update activity. Please try again."));
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = (a: Activity) => {
    const n = editName.trim();
    const m = Number(editMax);
    if (!n) { toast.error("Activity name is required."); return; }
    if (!Number.isInteger(m) || m < 1) { toast.error("Maximum score must be a whole number of at least 1."); return; }
    void update(a, { name: n, maxScore: m }, "Activity updated successfully.");
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteActivity({ data: { id: toDelete.id } });
      toast.success("Activity deleted successfully.");
      setToDelete(null);
      await refresh();
    } catch (err) {
      toast.error(errMsg(err, "Failed to delete activity. Please try again."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className={cn(panel, "grid gap-3 p-4 sm:grid-cols-[1fr_9rem_auto] sm:items-end")}>
        <div className="space-y-1.5">
          <Label htmlFor="act-name">Activity Name</Label>
          <Input id="act-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pitch Perfect" maxLength={100} className="h-11 border-line bg-ink-3/60" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="act-max">Maximum Score</Label>
          <Input id="act-max" type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} className="h-11 border-line bg-ink-3/60 font-mono" />
        </div>
        <Button type="submit" disabled={adding} className={cn(btnSave, "h-11 px-6")}>{adding ? "Adding…" : "Add Activity"}</Button>
      </form>

      <p className="text-xs text-muted-foreground">
        Only <strong>live</strong> and <strong>completed</strong> activities count toward the leaderboard. <strong>Disabled</strong> activities are hidden from the public and can’t be scored.
      </p>

      <div className={cn(panel, "overflow-x-auto")}>
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>Activity</th><th className={cn(th, "text-right")}>Max</th><th className={th}>Status</th>
              <th className={cn(th, "text-right")}>Teams scored</th><th className={cn(th, "text-right")}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {activities.map((a) => {
              const locked = a.status === "completed" && !isSuper;
              const busy = busyId === a.id;
              return (
                <tr key={a.id} className={a.status === "disabled" ? "opacity-60" : undefined}>
                  <td className={td}>
                    {editing === a.id ? (
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9 border-line bg-ink-3/60" />
                    ) : (
                      <span className="font-medium">{a.name}</span>
                    )}
                  </td>
                  <td className={cn(td, "text-right font-mono")}>
                    {editing === a.id ? (
                      <Input type="number" min={1} value={editMax} onChange={(e) => setEditMax(e.target.value)} className="ml-auto h-9 w-24 border-line bg-ink-3/60 text-right font-mono" />
                    ) : a.max_score}
                  </td>
                  <td className={td}>
                    <select
                      value={a.status} disabled={busy || locked}
                      onChange={(e) => void update(a, { status: e.target.value as (typeof STATUSES)[number] }, "Activity status updated.")}
                      className="h-9 border border-line bg-ink-3/60 px-2 text-sm capitalize"
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className={cn(td, "text-right font-mono")}>{counts.get(a.id) ?? 0}</td>
                  <td className={cn(td, "text-right")}>
                    <div className="flex justify-end gap-2">
                      {editing === a.id ? (
                        <>
                          <Button disabled={busy} onClick={() => saveEdit(a)} className={btnSave}>{busy ? "Saving…" : "Save"}</Button>
                          <Button variant="ghost" onClick={() => setEditing(null)} className="h-9">Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button disabled={locked} onClick={() => { setEditing(a.id); setEditName(a.name); setEditMax(String(a.max_score)); }} className={btnEdit}>Edit</Button>
                          <Button disabled={locked} onClick={() => setToDelete(a)} className={btnDelete}>Delete</Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Confirm
        open={!!toDelete} busy={deleting} confirmLabel="Delete Activity"
        title={`Delete "${toDelete?.name}"?`}
        description={<>This removes the activity and <strong>all {counts.get(toDelete?.id ?? "") ?? 0} scores</strong> entered for it. Team totals and rankings will be recalculated. Consider setting it to <em>Disabled</em> instead.</>}
        onCancel={() => setToDelete(null)} onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

/* ---------- scores ---------- */

function validateScore(raw: string, a: Activity): number | string {
  if (raw.trim() === "") return "Enter a score.";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Score must be a number.";
  if (n < 0) return "Score cannot be negative.";
  if (n > a.max_score) return `Score cannot exceed ${a.max_score}.`;
  return n;
}

function ScoresSection({ teams, activities, scores, isSuper }: { teams: Team[]; activities: Activity[]; scores: Score[]; isSuper: boolean }) {
  const refresh = useRefresh();
  const scorable = activities.filter((a) => a.status !== "disabled");
  const [activityId, setActivityId] = useState<string>(scorable.find((a) => a.status === "live")?.id ?? scorable[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toDelete, setToDelete] = useState<{ team: Team; score: Score } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // quick entry
  const [qTeam, setQTeam] = useState("");
  const [qAct, setQAct] = useState("");
  const [qPts, setQPts] = useState("");
  const [qBusy, setQBusy] = useState(false);

  const activity = activities.find((a) => a.id === activityId);
  const locked = !!activity && activity.status === "completed" && !isSuper;
  const scoreOf = (teamId: string, actId: string) => scores.find((s) => s.team_id === teamId && s.activity_id === actId);

  const save = async (teamId: string, actId: string, raw: string, quiet = false): Promise<boolean> => {
    const a = activities.find((x) => x.id === actId);
    if (!a) { toast.error("Select an activity."); return false; }
    const v = validateScore(raw, a);
    const team = teams.find((t) => t.id === teamId);
    if (typeof v === "string") { toast.error(`${team?.name ?? "Team"}: ${v}`); return false; }
    const existing = scoreOf(teamId, actId);
    try {
      const res = await upsertScore({ data: { teamId, activityId: actId, points: v, expectedVersion: existing?.version ?? 0 } });
      if (!quiet) {
        if (res.unchanged) toast.info("Score unchanged.");
        else toast.success(existing ? `Score updated successfully (${formatScore(existing.points)} → ${formatScore(v)}).` : "Score saved successfully.");
      }
      return true;
    } catch (err) {
      toast.error(`${team?.name ?? "Team"}: ${errMsg(err, "Failed to update score. Please try again.")}`);
      return false;
    }
  };

  const saveRow = async (teamId: string) => {
    if (savingIds.has(teamId)) return;
    setSavingIds((s) => new Set(s).add(teamId));
    const ok = await save(teamId, activityId, drafts[teamId] ?? "");
    if (ok) setDrafts((d) => { const n = { ...d }; delete n[teamId]; return n; });
    await refresh();
    setSavingIds((s) => { const n = new Set(s); n.delete(teamId); return n; });
  };

  const dirty = Object.entries(drafts).filter(([id, v]) => {
    const cur = scoreOf(id, activityId);
    return v.trim() !== "" && (cur ? Number(v) !== Number(cur.points) : true);
  });

  const saveAll = async () => {
    if (bulkBusy || dirty.length === 0) return;
    setBulkBusy(true);
    let ok = 0;
    const saved: string[] = [];
    for (const [id, v] of dirty) {
      if (await save(id, activityId, v, true)) { ok++; saved.push(id); }
    }
    setDrafts((d) => { const n = { ...d }; for (const id of saved) delete n[id]; return n; });
    await refresh();
    setBulkBusy(false);
    if (ok) toast.success(`${ok} score${ok === 1 ? "" : "s"} saved successfully.`);
  };

  const quickSave = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (qBusy) return;
    if (!qTeam || !qAct) { toast.error("Select a team and an activity."); return; }
    setQBusy(true);
    const ok = await save(qTeam, qAct, qPts);
    if (ok) setQPts("");
    await refresh();
    setQBusy(false);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteScore({ data: { teamId: toDelete.team.id, activityId: toDelete.score.activity_id, expectedVersion: toDelete.score.version } });
      toast.success("Score deleted successfully.");
      setToDelete(null);
      await refresh();
    } catch (err) {
      toast.error(errMsg(err, "Failed to delete score. Please try again."));
    } finally {
      setDeleting(false);
    }
  };

  const q = search.trim().toLowerCase();
  const rows = (q ? teams.filter((t) => t.name.toLowerCase().includes(q)) : teams).slice().sort((a, b) => a.name.localeCompare(b.name));
  const qActivity = activities.find((a) => a.id === qAct);

  return (
    <div className="space-y-6">
      {/* Quick entry */}
      <form onSubmit={quickSave} className={cn(panel, "grid gap-3 p-4 md:grid-cols-[1fr_1fr_8rem_auto] md:items-end")}>
        <div className="space-y-1.5">
          <Label htmlFor="q-team">Team</Label>
          <select id="q-team" value={qTeam} onChange={(e) => setQTeam(e.target.value)} className="h-11 w-full border border-line bg-ink-3/60 px-2 text-sm">
            <option value="">Select team…</option>
            {teams.slice().sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-act">Activity</Label>
          <select id="q-act" value={qAct} onChange={(e) => setQAct(e.target.value)} className="h-11 w-full border border-line bg-ink-3/60 px-2 text-sm">
            <option value="">Select activity…</option>
            {scorable.map((a) => <option key={a.id} value={a.id}>{a.name} (max {a.max_score})</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="q-pts">Score</Label>
          <Input id="q-pts" type="number" min={0} max={qActivity?.max_score} step="any" value={qPts} onChange={(e) => setQPts(e.target.value)} className="h-11 border-line bg-ink-3/60 font-mono" />
        </div>
        <Button type="submit" disabled={qBusy} className={cn(btnSave, "h-11 px-6")}>{qBusy ? "Saving…" : "Save Score"}</Button>
        {qTeam && qAct && (
          <p className="text-xs text-muted-foreground md:col-span-4">
            Current score: {(() => { const s = scoreOf(qTeam, qAct); return s ? formatScore(s.points) : "none yet"; })()}
          </p>
        )}
      </form>

      {/* Bulk entry */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5 sm:w-80">
            <Label htmlFor="bulk-act">Bulk entry — activity</Label>
            <select id="bulk-act" value={activityId} onChange={(e) => { setActivityId(e.target.value); setDrafts({}); }} className="h-11 w-full border border-line bg-ink-2/80 px-2 text-sm">
              {scorable.map((a) => <option key={a.id} value={a.id}>{a.name} · max {a.max_score} · {a.status}</option>)}
            </select>
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams…" className="h-11 flex-1 border-line bg-ink-2/80" />
          <Button disabled={bulkBusy || dirty.length === 0 || locked} onClick={() => void saveAll()} className={cn(btnSave, "h-11 px-6")}>
            {bulkBusy ? "Saving…" : `Save all (${dirty.length})`}
          </Button>
        </div>
        {locked && <p className="text-sm text-down">This activity is completed. Only a super admin can change its scores.</p>}

        {activity && (
          <div className={cn(panel, "overflow-x-auto")}>
            <table className="w-full min-w-[620px]">
              <thead className="border-b border-line">
                <tr>
                  <th className={th}>Team</th><th className={cn(th, "text-right")}>Current</th>
                  <th className={cn(th, "text-right")}>New score (max {activity.max_score})</th><th className={cn(th, "text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {rows.map((t) => {
                  const cur = scoreOf(t.id, activity.id);
                  const draft = drafts[t.id] ?? "";
                  const invalid = draft !== "" && typeof validateScore(draft, activity) === "string";
                  const busy = savingIds.has(t.id) || bulkBusy;
                  return (
                    <tr key={t.id}>
                      <td className={cn(td, "font-medium")}>{t.name}</td>
                      <td className={cn(td, "text-right font-mono")}>{cur ? formatScore(cur.points) : <span className="text-muted-foreground">—</span>}</td>
                      <td className={cn(td, "text-right")}>
                        <Input
                          type="number" min={0} max={activity.max_score} step="any" disabled={locked}
                          value={draft} placeholder={cur ? String(cur.points) : ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") void saveRow(t.id); }}
                          aria-invalid={invalid}
                          className={cn("ml-auto h-9 w-28 border-line bg-ink-3/60 text-right font-mono", invalid && "border-down ring-1 ring-down")}
                        />
                      </td>
                      <td className={cn(td, "text-right")}>
                        <div className="flex justify-end gap-2">
                          <Button disabled={busy || locked || draft === "" || invalid} onClick={() => void saveRow(t.id)} className={btnSave}>
                            {savingIds.has(t.id) ? "Saving…" : cur ? "Update" : "Save"}
                          </Button>
                          <Button disabled={!cur || locked || busy} onClick={() => cur && setToDelete({ team: t, score: cur })} className={btnDelete}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Confirm
        open={!!toDelete} busy={deleting} confirmLabel="Delete Score"
        title="Are you sure you want to delete this score?"
        description={<>{toDelete?.team.name} · {activities.find((a) => a.id === toDelete?.score.activity_id)?.name} · current score <strong>{toDelete ? formatScore(toDelete.score.points) : ""}</strong>. The team’s total and ranking will be recalculated. You can undo this from Score History.</>}
        onCancel={() => setToDelete(null)} onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

/* ---------- history ---------- */

function HistorySection({ logs, loading }: { logs: HistoryLog[]; loading: boolean }) {
  const refresh = useRefresh();
  const [scope, setScope] = useState<"scores" | "all">("scores");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<HistoryLog | null>(null);
  const [busy, setBusy] = useState(false);

  const q = search.trim().toLowerCase();
  const shown = logs
    .filter((l) => scope === "all" || l.entity_type === "score")
    .filter((l) => !q || describe(l).toLowerCase().includes(q) || l.performer.toLowerCase().includes(q));

  const canRollback = (l: HistoryLog) => {
    if (l.entity_type !== "score") return false;
    const v = (l.new_value ?? l.old_value) as { team_id?: string } | null;
    return !!v?.team_id;
  };

  const doRollback = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await rollbackScore({ data: { logId: target.id } });
      toast.success("Score rolled back successfully.");
      setTarget(null);
      await refresh();
    } catch (err) {
      toast.error(errMsg(err, "Failed to roll back score. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const o = target?.old_value as ScoreVal;
  const n = target?.new_value as ScoreVal;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex">
          {(["scores", "all"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)} className={cn("h-11 border border-line px-4 text-sm", scope === s ? "bg-primary text-primary-foreground" : "bg-ink-2/80")}>
              {s === "scores" ? "Score changes" : "All changes"}
            </button>
          ))}
        </div>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search team, activity or admin…" className="h-11 flex-1 border-line bg-ink-2/80" />
      </div>

      <div className={cn(panel, "overflow-x-auto")}>
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-line">
            <tr>
              <th className={th}>Time</th><th className={th}>Team · Activity · Change</th><th className={th}>Action</th>
              <th className={th}>By</th><th className={cn(th, "text-right")}>Rollback</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {loading && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">Loading history…</td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No history yet.</td></tr>}
            {shown.map((l) => (
              <tr key={l.id}>
                <td className={cn(td, "whitespace-nowrap font-mono text-xs text-muted-foreground")}>
                  {new Date(l.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}
                </td>
                <td className={td}>{describe(l)}</td>
                <td className={cn(td, "whitespace-nowrap font-semibold")}>{ACTION_LABEL[l.action] ?? l.action}</td>
                <td className={cn(td, "max-w-[12rem] truncate text-xs text-muted-foreground")}>{l.performer}</td>
                <td className={cn(td, "text-right")}>
                  {canRollback(l) && <Button onClick={() => setTarget(l)} className={btnRollback}>Rollback</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Confirm
        open={!!target} busy={busy} tone="warn" confirmLabel="Roll Back"
        title="Roll back this score change?"
        description={
          <>
            {n?.team_name ?? o?.team_name} · {n?.activity_name ?? o?.activity_name}
            <br />
            The score will go from <strong>{n?.points ?? "no score"}</strong> back to <strong>{o?.points ?? "no score (entry removed)"}</strong>. Totals and rankings will be recalculated, and the rollback will be recorded here.
          </>
        }
        onCancel={() => setTarget(null)} onConfirm={() => void doRollback()}
      />
    </div>
  );
}

/* ---------- admin users ---------- */

function AdminsSection({ isSuper }: { isSuper: boolean }) {
  const qc = useQueryClient();
  const admins = useQuery({ queryKey: ["admins"], queryFn: () => listAdmins() });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "super_admin" | "viewer">("admin");
  const [busy, setBusy] = useState(false);
  const [toRemove, setToRemove] = useState<{ userId: string; email: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  const add = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim()) { toast.error("Enter an email."); return; }
    setBusy(true);
    try {
      await setAdminRole({ data: { email: email.trim(), role } });
      toast.success("Access updated successfully.");
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["admins"] });
    } catch (err) {
      toast.error(errMsg(err, "Failed to update access. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toRemove) return;
    setRemoving(true);
    try {
      await removeAdmin({ data: { userId: toRemove.userId } });
      toast.success("Access removed.");
      setToRemove(null);
      await qc.invalidateQueries({ queryKey: ["admins"] });
    } catch (err) {
      toast.error(errMsg(err, "Failed to remove access. Please try again."));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      {isSuper ? (
        <form onSubmit={add} className={cn(panel, "grid gap-3 p-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end")}>
          <div className="space-y-1.5">
            <Label htmlFor="adm-email">Email of an existing account</Label>
            <Input id="adm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="volunteer@example.com" className="h-11 border-line bg-ink-3/60" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adm-role">Role</Label>
            <select id="adm-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="h-11 w-full border border-line bg-ink-3/60 px-2 text-sm">
              <option value="admin">Admin</option>
              <option value="super_admin">Super admin</option>
              <option value="viewer">Viewer (no editing)</option>
            </select>
          </div>
          <Button type="submit" disabled={busy} className={cn(btnSave, "h-11 px-6")}>{busy ? "Saving…" : "Grant Access"}</Button>
          <p className="text-xs text-muted-foreground sm:col-span-3">The person must first create an account on the admin sign-in page.</p>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Only a super admin can add or remove admins.</p>
      )}

      <div className={cn(panel, "overflow-x-auto")}>
        <table className="w-full min-w-[480px]">
          <thead className="border-b border-line">
            <tr><th className={th}>Email</th><th className={th}>Role</th><th className={cn(th, "text-right")}>Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-line/50">
            {admins.isLoading && <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</td></tr>}
            {admins.error && <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-down">{errMsg(admins.error, "Could not load admins.")}</td></tr>}
            {admins.data?.admins.map((a) => (
              <tr key={a.userId}>
                <td className={td}>{a.email}{a.isMe && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</td>
                <td className={cn(td, "capitalize")}>{a.role.replace("_", " ")}</td>
                <td className={cn(td, "text-right")}>
                  {isSuper && !a.isMe && <Button onClick={() => setToRemove({ userId: a.userId, email: a.email })} className={btnDelete}>Remove</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Confirm
        open={!!toRemove} busy={removing} confirmLabel="Remove Access"
        title={`Remove access for ${toRemove?.email}?`}
        description="They will no longer be able to change teams, activities or scores."
        onCancel={() => setToRemove(null)} onConfirm={() => void remove()}
      />
    </div>
  );
}
