import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  LogOut,
  ScrollText,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import {
  getAuditLogs,
  getMyRole,
  updateActivity,
  createTeam,
  renameTeam,
  deleteTeam,
  upsertScore,
} from "@/lib/admin.functions";
import { formatScore, formatTime } from "@/lib/leaderboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      { name: "description", content: "Score entry, team management, activity control and audit logs for BIZZNNOVATE." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Section = "dashboard" | "scores" | "teams" | "activities" | "audit";

const NAV: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "scores", label: "Score Entry", icon: ClipboardList },
  { id: "teams", label: "Teams", icon: Users },
  { id: "activities", label: "Activities", icon: ActivityIcon },
  { id: "audit", label: "Audit Logs", icon: ScrollText },
];

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>("dashboard");
  const { standings, teams, activities, scores, lastUpdated } = useLeaderboard();

  const roleQuery = useQuery({ queryKey: ["my-role"], queryFn: () => getMyRole() });
  const role = roleQuery.data?.role ?? null;
  const isSuper = role === "super_admin";

  useEffect(() => {
    if (roleQuery.data && !roleQuery.data.role) {
      toast.error("No admin role assigned to this account.");
    }
  }, [roleQuery.data]);

  const signOut = async () => {
    await supabase.auth.signOut();
    void navigate({ to: "/" });
  };

  const scoredActivities = activities.filter((a) => a.status !== "upcoming").length;
  const pendingScores =
    teams.length * activities.filter((a) => a.status === "live").length -
    scores.filter((s) =>
      activities.some((a) => a.id === s.activity_id && a.status === "live"),
    ).length;

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground md:flex-row">
      {/* Sidebar */}
      <aside className="flex shrink-0 flex-col border-b border-line/50 bg-ink-2/80 p-4 md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-2">
          <img src={emblem.url} alt="BIZZNNOVATE emblem" className="size-10 object-contain" />
          <div className="min-w-0">
            <img
              src={wordmark.url}
              alt="BIZZNNOVATE"
              className="h-auto w-30 object-contain object-left"
            />
            <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-primary">
              Admin Console
            </div>
          </div>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto md:mt-8 md:block md:space-y-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                 "flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2.5 font-mono text-xs uppercase tracking-[0.15em] transition-colors md:w-full md:gap-3",
                section === item.id
                   ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-ink-3/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-3 flex gap-2 md:mt-auto md:block md:space-y-1">
          <Link
            to="/"
             className="flex items-center gap-3 px-3 py-2.5 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:bg-ink-3/60 hover:text-foreground md:w-full"
          >
            <ListChecks className="size-4" /> Leaderboard
          </Link>
          <button
            onClick={signOut}
             className="flex items-center gap-3 px-3 py-2.5 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:bg-ink-3/60 hover:text-down md:w-full"
          >
            <LogOut className="size-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
       <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
             <h1 className="font-heading text-3xl font-semibold tracking-wide">
              {NAV.find((n) => n.id === section)?.label}
            </h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Role: {role ?? "none"} · Updated {lastUpdated ? formatTime(lastUpdated) : "—"}
            </p>
          </div>
        </div>

        {section === "dashboard" && (
          <Dashboard
            totalTeams={teams.length}
            scoredActivities={scoredActivities}
            totalActivities={activities.length}
            lastUpdated={lastUpdated}
            topTeam={standings[0]?.team.name ?? "—"}
            pendingScores={Math.max(0, pendingScores)}
          />
        )}
        {section === "scores" && (
          <ScoreEntry
            teams={teams}
            activities={activities}
            scores={scores}
            isSuper={isSuper}
            onSaved={() => void queryClient.invalidateQueries({ queryKey: ["leaderboard"] })}
          />
        )}
        {section === "teams" && <TeamsSection teams={teams} />}
        {section === "activities" && (
          <ActivitiesSection activities={activities} isSuper={isSuper} />
        )}
        {section === "audit" && <AuditSection />}
      </main>
    </div>
  );
}

function Dashboard(props: {
  totalTeams: number;
  scoredActivities: number;
  totalActivities: number;
  lastUpdated: Date | null;
  topTeam: string;
  pendingScores: number;
}) {
  const cards = [
    { label: "Total Teams", value: String(props.totalTeams) },
    { label: "Scored Activities", value: `${props.scoredActivities} / ${props.totalActivities}` },
    { label: "Last Update", value: props.lastUpdated ? formatTime(props.lastUpdated) : "—" },
    { label: "Top Team", value: props.topTeam },
    { label: "Pending Scores", value: String(props.pendingScores) },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {cards.map((c) => (
         <div key={c.label} className="glass border border-line/40 p-4 shadow-[2px_3px_0_#a4774b26]">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {c.label}
          </div>
          <div className="mt-2 truncate font-display text-2xl text-foreground">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function ScoreEntry({
  teams,
  activities,
  scores,
  isSuper,
  onSaved,
}: {
  teams: import("@/lib/leaderboard").Team[];
  activities: import("@/lib/leaderboard").Activity[];
  scores: import("@/lib/leaderboard").Score[];
  isSuper: boolean;
  onSaved: () => void;
}) {
  const [activityId, setActivityId] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("");
  const [points, setPoints] = useState<string>("");
  const [remarks, setRemarks] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const activity = activities.find((a) => a.id === activityId);
  const team = teams.find((t) => t.id === teamId);
  const existing = scores.find((s) => s.team_id === teamId && s.activity_id === activityId);

  const filteredTeams = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) => t.name.toLowerCase().includes(q) || t.team_code.toLowerCase().includes(q),
    );
  }, [teams, teamSearch]);

  const pointsNum = Number(points);
  const valid =
    activity &&
    team &&
    points !== "" &&
    !Number.isNaN(pointsNum) &&
    pointsNum >= 0 &&
    pointsNum <= activity.max_score &&
    (activity.status !== "completed" || isSuper);

  const save = async () => {
    if (!activity || !team) return;
    setBusy(true);
    try {
      const result = await upsertScore({
        data: {
          teamId: team.id,
          activityId: activity.id,
          points: pointsNum,
          remarks: remarks || undefined,
          expectedVersion: existing?.version ?? 0,
        },
      });
      toast.success(
        `Score saved: ${team.name} · ${activity.name} → ${pointsNum}`,
      );
      setConfirmOpen(false);
      setPoints("");
      setRemarks("");
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save score";
      if (msg.startsWith("CONFLICT")) {
        toast.error(msg.replace("CONFLICT: ", ""));
        onSaved();
      } else {
        toast.error(msg);
      }
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="glass border border-line/40 p-5 shadow-[2px_3px_0_#a4774b26]">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">
          Score Entry
        </div>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Activity
            </Label>
            <Select value={activityId} onValueChange={setActivityId}>
              <SelectTrigger className="border-line bg-ink-3/60 font-mono text-sm">
                <SelectValue placeholder="Select activity…" />
              </SelectTrigger>
              <SelectContent className="border-line bg-ink-3">
                {activities.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="font-mono text-sm">
                    {a.name} · max {a.max_score} · {a.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activity?.status === "completed" && !isSuper && (
              <p className="font-mono text-[11px] text-down">
                Completed activity — only super admins can modify.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Team
            </Label>
            <Input
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              placeholder="Search team…"
              className="border-line bg-ink-3/60 font-mono text-sm"
            />
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="border-line bg-ink-3/60 font-mono text-sm">
                <SelectValue placeholder="Select team…" />
              </SelectTrigger>
              <SelectContent className="border-line bg-ink-3">
                {filteredTeams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="font-mono text-sm">
                    {t.team_code} · {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Score {activity ? `(0 – ${activity.max_score})` : ""}
            </Label>
            <Input
              type="number"
              min={0}
              max={activity?.max_score}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="border-line bg-ink-3/60 font-mono text-sm"
              placeholder={existing ? `Current: ${existing.points}` : "Enter points"}
            />
            {existing && (
              <p className="font-mono text-[11px] text-muted-foreground">
                Previous: {formatScore(existing.points)} · v{existing.version} · updated{" "}
                {formatTime(new Date(existing.updated_at))}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Remarks
            </Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="border-line bg-ink-3/60 font-mono text-sm"
              placeholder="Optional judge remarks…"
              rows={2}
            />
          </div>

          <Button
            disabled={!valid || busy}
            onClick={() => setConfirmOpen(true)}
            className="w-full bg-primary font-mono text-xs font-semibold uppercase tracking-[0.15em] text-primary-foreground hover:bg-primary/90"
          >
            Review & Save
          </Button>
        </div>
      </div>

      {/* Current scores table */}
       <div className="overflow-x-auto border border-line/40 bg-ink-2/80">
        <div className="min-w-[430px]">
        <div className="grid grid-cols-[1fr_5rem_5rem_6rem] gap-3 border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>Team</span>
          <span className="text-right">Score</span>
          <span className="text-right">Max</span>
          <span className="text-right">Updated</span>
        </div>
       </div>
        <div className="max-h-[480px] divide-y divide-line/60 overflow-y-auto">
          {activityId &&
            teams.map((t) => {
              const s = scores.find(
                (x) => x.team_id === t.id && x.activity_id === activityId,
              );
              return (
                <button
                  key={t.id}
                  onClick={() => setTeamId(t.id)}
                  className={cn(
                    "grid w-full grid-cols-[1fr_5rem_5rem_6rem] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink-3/50",
                    teamId === t.id && "bg-primary/10",
                  )}
                >
                  <span className="truncate font-mono text-sm text-foreground">
                    {t.team_code} · {t.name}
                  </span>
                  <span className="text-right font-mono text-sm text-foreground">
                    {s ? formatScore(s.points) : "—"}
                  </span>
                  <span className="text-right font-mono text-sm text-muted-foreground">
                    {activity?.max_score ?? "—"}
                  </span>
                  <span className="text-right font-mono text-[11px] text-muted-foreground">
                    {s ? formatTime(new Date(s.updated_at)) : "—"}
                  </span>
                </button>
              );
            })}
          {!activityId && (
            <div className="px-4 py-10 text-center font-mono text-sm text-muted-foreground">
              Select an activity to see current scores.
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="border-line bg-ink-2 text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl tracking-wide">
              Update {team?.name} score?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 font-mono text-sm text-muted-foreground">
                <div>Activity: {activity?.name}</div>
                <div>Previous: {existing ? formatScore(existing.points) : "—"}</div>
                <div>New: {formatScore(pointsNum)}</div>
                <div className={pointsNum - (existing?.points ?? 0) >= 0 ? "text-up" : "text-down"}>
                  Difference: {pointsNum - (existing?.points ?? 0) >= 0 ? "+" : ""}
                  {formatScore(pointsNum - (existing?.points ?? 0))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-line bg-transparent font-mono text-xs uppercase tracking-[0.15em] text-foreground hover:bg-ink-3">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void save();
              }}
              disabled={busy}
              className="bg-primary font-mono text-xs uppercase tracking-[0.15em] text-primary-foreground hover:bg-primary/90"
            >
              {busy ? "Saving…" : "Confirm Update"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TeamsSection({ teams }: { teams: import("@/lib/leaderboard").Team[] }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [toDelete, setToDelete] = useState<import("@/lib/leaderboard").Team | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
  const isDup = (name: string, exceptId?: string) =>
    teams.some((t) => t.id !== exceptId && t.name.trim().toLowerCase() === name.trim().toLowerCase());

  const add = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) { toast.error("Team name is required."); return; }
    if (isDup(name)) { toast.error(`A team named "${name}" already exists.`); return; }
    setAdding(true);
    try {
      await createTeam({ data: { name } });
      toast.success(`Team "${name}" added`);
      setNewName("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add team");
    } finally {
      setAdding(false);
    }
  };

  const saveName = async (id: string) => {
    const name = editName.trim();
    if (!name) { toast.error("Team name is required."); return; }
    if (isDup(name, id)) { toast.error(`A team named "${name}" already exists.`); return; }
    try {
      await renameTeam({ data: { id, name } });
      toast.success("Team renamed");
      setEditing(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await deleteTeam({ data: { id: toDelete.id } });
      toast.success(`Team "${toDelete.name}" deleted`);
      setToDelete(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? teams.filter((t) => t.name.toLowerCase().includes(q) || t.team_code.toLowerCase().includes(q))
    : teams;

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex flex-col gap-2 border border-line/40 bg-ink-2/80 p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="new-team" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Team Name
          </Label>
          <Input
            id="new-team"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Enter team name"
            maxLength={100}
            className="border-line bg-ink-3/60"
          />
        </div>
        <Button type="submit" disabled={adding} className="bg-primary font-mono text-xs uppercase tracking-[0.15em] text-primary-foreground hover:bg-primary/90">
          {adding ? "Adding…" : "Add Team"}
        </Button>
      </form>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Search ${teams.length} teams…`}
        className="border-line bg-ink-2/80"
      />

      <div className="divide-y divide-line/60 border border-line/40 bg-ink-2/80">
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No teams found.</p>
        )}
        {filtered.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-12 shrink-0 font-mono text-sm text-muted-foreground">{t.team_code}</span>
            {editing === t.id ? (
              <>
                <Input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveName(t.id);
                    if (e.key === "Escape") setEditing(null);
                  }}
                  maxLength={100}
                  className="h-8 flex-1 border-line bg-ink-3/60 text-sm"
                />
                <Button size="sm" onClick={() => void saveName(t.id)} className="h-8 bg-primary font-mono text-[10px] uppercase text-primary-foreground">
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="h-8 font-mono text-[10px] uppercase">
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{t.name}</span>
                <button
                  onClick={() => { setEditing(t.id); setEditName(t.name); }}
                  className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-primary ring-1 ring-primary/30 hover:bg-primary/10"
                >
                  Edit
                </button>
                <button
                  onClick={() => setToDelete(t)}
                  className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-down ring-1 ring-down/30 hover:bg-down/10"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && !busy && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{toDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the team and <strong>all of its scores</strong> across every activity. The leaderboard will be re-ranked. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              className="bg-down text-primary-foreground hover:bg-down/90"
            >
              {busy ? "Deleting…" : "Delete Team"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActivitiesSection({
  activities,
  isSuper,
}: {
  activities: import("@/lib/leaderboard").Activity[];
  isSuper: boolean;
}) {
  const queryClient = useQueryClient();
  const setStatus = async (id: string, status: "upcoming" | "live" | "completed") => {
    try {
      await updateActivity({ data: { id, status } });
      toast.success(`Activity marked ${status}`);
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {activities.map((a) => (
        <div key={a.id} className="glass border border-line/40 p-4 shadow-[2px_3px_0_#a4774b26]">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-display text-lg tracking-wide text-foreground">{a.name}</div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Day {a.day} · Max {a.max_score} · Weight {a.weight}
              </div>
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] ring-1",
                a.status === "live" && "bg-gold/15 text-gold ring-gold/40",
                a.status === "completed" && "bg-up/15 text-up ring-up/40",
                a.status === "upcoming" && "bg-ink-3 text-muted-foreground ring-line",
              )}
            >
              {a.status}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{a.description}</p>
          <div className="mt-3 flex gap-2">
            {(["upcoming", "live", "completed"] as const).map((s) => (
              <button
                key={s}
                disabled={a.status === s || (a.status === "completed" && s !== "completed" && !isSuper)}
                onClick={() => void setStatus(a.id, s)}
                className={cn(
                  "rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] ring-1 transition-colors",
                  a.status === s
                    ? "bg-primary/15 text-primary ring-primary/40"
                    : "text-muted-foreground ring-line hover:text-foreground disabled:opacity-40",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditSection() {
  const query = useQuery({ queryKey: ["audit-logs"], queryFn: () => getAuditLogs() });
  const logs = query.data?.logs ?? [];

  return (
    <div className="overflow-x-auto border border-line/40 bg-ink-2/80">
      <div className="min-w-[680px]">
      <div className="grid grid-cols-[7rem_1fr_6rem_1fr] gap-3 border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>Time</span>
        <span>Action</span>
        <span>Entity</span>
        <span>Change</span>
      </div>
      <div className="max-h-[560px] divide-y divide-line/60 overflow-y-auto">
        {logs.map((log) => (
          <div
            key={log.id as string}
            className="grid grid-cols-[7rem_1fr_6rem_1fr] items-center gap-3 px-4 py-2.5"
          >
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatTime(new Date(log.created_at as string))}
            </span>
            <span className="font-mono text-sm text-foreground">{log.action as string}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {log.entity_type as string}
            </span>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {log.old_value ? JSON.stringify(log.old_value) : "∅"} →{" "}
              {log.new_value ? JSON.stringify(log.new_value) : "∅"}
            </span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="px-4 py-10 text-center font-mono text-sm text-muted-foreground">
            No audit entries yet.
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
