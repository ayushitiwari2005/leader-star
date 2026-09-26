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
  updateTeam,
  upsertScore,
} from "@/lib/admin.functions";
import { formatCapital, formatScore, formatTime } from "@/lib/leaderboard";
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
    <div className="flex min-h-screen bg-ink font-sans text-foreground">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-line/50 bg-ink-2/80 p-4">
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
        <nav className="mt-8 space-y-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 font-mono text-xs uppercase tracking-[0.15em] transition-colors",
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
        <div className="mt-auto space-y-1">
          <Link
            to="/"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:bg-ink-3/60 hover:text-foreground"
          >
            <ListChecks className="size-4" /> Leaderboard
          </Link>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:bg-ink-3/60 hover:text-down"
          >
            <LogOut className="size-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1 p-6 lg:p-8">
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
        <div key={c.label} className="glass rounded-xl p-4 ring-1 ring-line">
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
      <div className="glass rounded-xl p-5 ring-1 ring-line">
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
      <div className="overflow-hidden rounded-xl bg-ink-2/60 ring-1 ring-line">
        <div className="grid grid-cols-[1fr_5rem_5rem_6rem] gap-3 border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>Team</span>
          <span className="text-right">Score</span>
          <span className="text-right">Max</span>
          <span className="text-right">Updated</span>
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
  const [editing, setEditing] = useState<string | null>(null);
  const [capital, setCapital] = useState("");
  const [business, setBusiness] = useState("");

  const save = async (id: string) => {
    try {
      await updateTeam({
        data: {
          id,
          currentCapital: capital !== "" ? Number(capital) : undefined,
          acquiredBusiness: business || null,
        },
      });
      toast.success("Team updated");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <div className="overflow-hidden rounded-xl bg-ink-2/60 ring-1 ring-line">
      <div className="grid grid-cols-[4rem_1fr_7rem_1fr_5rem] gap-3 border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>Code</span>
        <span>Team</span>
        <span className="text-right">Capital</span>
        <span>Acquired Business</span>
        <span />
      </div>
      <div className="divide-y divide-line/60">
        {teams.map((t) => (
          <div
            key={t.id}
            className="grid grid-cols-[4rem_1fr_7rem_1fr_5rem] items-center gap-3 px-4 py-2.5"
          >
            <span className="font-mono text-sm text-muted-foreground">{t.team_code}</span>
            <span className="truncate font-medium text-foreground">{t.name}</span>
            {editing === t.id ? (
              <>
                <Input
                  type="number"
                  value={capital}
                  onChange={(e) => setCapital(e.target.value)}
                  className="h-8 border-line bg-ink-3/60 text-right font-mono text-sm"
                />
                <Input
                  value={business}
                  onChange={(e) => setBusiness(e.target.value)}
                  placeholder="Business name…"
                  className="h-8 border-line bg-ink-3/60 font-mono text-sm"
                />
                <div className="flex justify-end gap-1">
                  <Button size="sm" onClick={() => void save(t.id)} className="h-8 bg-primary font-mono text-[10px] uppercase text-primary-foreground">
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)} className="h-8 font-mono text-[10px] uppercase">
                    ✕
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span className="text-right font-mono text-sm text-foreground">
                  {formatCapital(t.current_capital)}
                </span>
                <span className="truncate font-mono text-sm text-muted-foreground">
                  {t.acquired_business ?? "—"}
                </span>
                <button
                  onClick={() => {
                    setEditing(t.id);
                    setCapital(String(t.current_capital));
                    setBusiness(t.acquired_business ?? "");
                  }}
                  className="justify-self-end rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-primary ring-1 ring-primary/30 transition-colors hover:bg-primary/10"
                >
                  Edit
                </button>
              </>
            )}
          </div>
        ))}
      </div>
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
        <div key={a.id} className="glass rounded-xl p-4 ring-1 ring-line">
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
    <div className="overflow-hidden rounded-xl bg-ink-2/60 ring-1 ring-line">
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
  );
}
