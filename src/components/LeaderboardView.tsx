import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Maximize, Search } from "lucide-react";
import { useLeaderboard } from "@/hooks/use-leaderboard";
import {
  formatCapital,
  formatScore,
  formatTime,
  type Standing,
} from "@/lib/leaderboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import emblem from "@/assets/reference-emblem.webp.asset.json";
import wordmark from "@/assets/reference-wordmark.webp.asset.json";

function TrendBadge({ delta }: { delta: number | undefined }) {
  if (delta === undefined || delta === 0)
    return <span className="text-muted-foreground">—</span>;
  if (delta > 0)
    return <span className="text-up">▲ {delta}</span>;
  return <span className="text-down">▼ {Math.abs(delta)}</span>;
}

function PodiumCard({
  standing,
  place,
  trend,
  onSelect,
}: {
  standing: Standing;
  place: 1 | 2 | 3;
  trend: number | undefined;
  onSelect: (s: Standing) => void;
}) {
  const isFirst = place === 1;
  return (
    <button
      onClick={() => onSelect(standing)}
      className={cn(
        "glass relative overflow-hidden rounded-sm border border-line/40 p-5 text-left shadow-[3px_4px_0_#a4774b33] transition-transform hover:-translate-y-1",
        isFirst ? "border-primary/60 p-6 bg-[#e7ddc9]" : "",
        place === 2 && "md:order-1 md:mt-8",
        place === 1 && "md:order-2",
        place === 3 && "md:order-3 md:mt-12",
      )}
    >
      {isFirst && (
        <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
          <div className="sweep h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent" />
        </div>
      )}
      <div
        className={cn(
          "absolute right-4 top-4 font-mono text-[11px] uppercase tracking-[0.2em]",
          isFirst ? "text-primary" : "text-muted-foreground",
        )}
      >
        Rank 0{place}
      </div>
      <div
        className={cn(
          "mt-8 font-heading",
          isFirst ? "text-7xl text-primary" : "text-6xl",
          place === 2 && "text-muted-foreground",
          place === 3 && "text-muted-foreground/80",
        )}
      >
        {place}
      </div>
      <div
        className={cn(
          "mt-3 font-display text-foreground",
          isFirst ? "text-3xl" : "text-2xl",
        )}
      >
        {standing.team.name}
      </div>
      <div
        className={cn(
          "font-mono text-[11px] uppercase tracking-[0.2em]",
          isFirst ? "text-primary" : "text-muted-foreground",
        )}
      >
        {standing.team.theme}
      </div>
      <div
        className={cn(
          "mt-4 font-mono font-semibold text-foreground",
          isFirst ? "text-4xl" : "text-3xl",
        )}
      >
        {formatScore(standing.total)}
      </div>
      <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <TrendBadge delta={trend} />
        <span>Capital {formatCapital(standing.team.current_capital)}</span>
      </div>
    </button>
  );
}

export function LeaderboardView({ displayMode = false }: { displayMode?: boolean }) {
  const { standings, activities, trends, lastUpdated, liveFlash, isLoading } =
    useLeaderboard();
  const [query, setQuery] = useState("");
  const [themeFilter, setThemeFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Standing | null>(null);

  const themes = useMemo(
    () => Array.from(new Set(standings.map((s) => s.team.theme))),
    [standings],
  );

  const filtered = useMemo(
    () =>
      standings.filter((s) => {
        const q = query.trim().toLowerCase();
        const matchesQ =
          !q ||
          s.team.name.toLowerCase().includes(q) ||
          s.team.team_code.toLowerCase().includes(q);
        const matchesT = themeFilter === "all" || s.team.theme === themeFilter;
        return matchesQ && matchesT;
      }),
    [standings, query, themeFilter],
  );

  const podium = standings.slice(0, 3);
  const rest = filtered.filter((s) => s.rank > 3);

  const requestFullscreen = () => {
    if (typeof document !== "undefined" && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.();
    }
  };

  return (
    <div className="min-h-screen font-sans text-foreground antialiased">

      <div
        className={cn(
          "relative mx-auto px-5 py-5",
          displayMode ? "max-w-[1600px] lg:px-12" : "max-w-[1440px] lg:px-10",
        )}
      >
        {/* HEADER */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line/40 pb-5">
          <div className="flex items-center gap-3">
            <img
              src={emblem.url}
              alt="BIZZNNOVATE emblem"
              className={cn("object-contain", displayMode ? "size-16" : "size-11 sm:size-13")}
            />
            <img src={wordmark.url} alt="BIZZNNOVATE" className={cn("h-auto object-contain", displayMode ? "w-56" : "w-36 sm:w-44")} />
            <span className="hidden border-l border-line/50 pl-4 font-mono text-[10px] uppercase tracking-[0.2em] text-primary md:block">IIPS · DAVV · INDORE</span>
          </div>
          <div className="flex items-center gap-3">
            {liveFlash && (
              <div className="slide-in border border-primary/30 bg-primary/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-primary">
                {liveFlash}
              </div>
            )}
            <div className="flex items-center gap-2 border border-primary/35 bg-primary/10 px-3 py-1.5">
              <span className="live-dot size-2 rounded-full bg-up" />
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-up">
                Live
              </span>
            </div>
            <div className="hidden border border-line/40 bg-ink-3/60 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground sm:block">
              Updated {lastUpdated ? formatTime(lastUpdated) : "—"}
            </div>
            {displayMode ? (
              <button
                onClick={requestFullscreen}
                className="flex items-center gap-2 border border-line/40 bg-ink-3/60 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
              >
                <Maximize className="size-3.5" /> Fullscreen
              </button>
            ) : (
              <div className="flex items-center gap-1 border border-line/40 bg-ink-3/60 p-1">
                <span className="bg-primary px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-primary-foreground">
                  Public
                </span>
                <Link
                  to="/display"
                   className="px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Display
                </Link>
                <Link
                  to="/admin"
                   className="px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Admin
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* TICKER */}
        <div className="mt-5 overflow-hidden border-y border-line/50 bg-ink-2/60">
          <div className="flex items-center gap-6 whitespace-nowrap py-2 pl-4 pr-2">
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
              Market
            </span>
            <div className="relative flex-1 overflow-hidden">
              <div className="flex gap-8 font-mono text-[12px] text-muted-foreground">
                <span>
                  FOOD / NUTRITION{" "}
                  <span className="text-up">
                    {standings.filter((s) => s.team.theme === "Food & Nutrition").length} TEAMS
                  </span>
                </span>
                <span>
                  HEALTH / FITNESS{" "}
                  <span className="text-up">
                    {standings.filter((s) => s.team.theme === "Health & Fitness").length} TEAMS
                  </span>
                </span>
                <span>
                  FASHION / LIFESTYLE{" "}
                  <span className="text-down">
                    {standings.filter((s) => s.team.theme === "Fashion & Lifestyle").length} TEAMS
                  </span>
                </span>
                <span>
                  VIRTUAL CAPITAL{" "}
                  <span className="text-primary">
                    {formatCapital(
                      standings.reduce((sum, s) => sum + s.team.current_capital, 0),
                    )}
                  </span>
                </span>
                <span>
                  TEAMS ACTIVE <span className="text-foreground">{standings.length}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* PODIUM */}
        <section className="mt-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <h1
              className={cn(
                "font-heading font-semibold tracking-tight text-foreground",
                displayMode ? "text-5xl sm:text-6xl" : "text-3xl sm:text-5xl",
              )}
            >
              Live Leaderboard
            </h1>
            <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              {activities.filter((a) => a.status !== "upcoming").length} of{" "}
              {activities.length} activities scored
            </span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                 <div key={i} className="h-56 animate-pulse border border-line/40 bg-ink-3/60" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {podium.map((s) => (
                <PodiumCard
                  key={s.team.id}
                  standing={s}
                  place={s.rank as 1 | 2 | 3}
                  trend={trends.get(s.team.id)}
                  onSelect={setSelected}
                />
              ))}
            </div>
          )}
        </section>

        {/* STANDINGS */}
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2
              className={cn(
                "font-heading font-semibold tracking-wide text-foreground",
                displayMode ? "text-3xl" : "text-xl",
              )}
            >
              Full Standings
            </h2>
            {!displayMode && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search team…"
                    className="h-9 w-48 border border-line/50 bg-ink-3/80 pl-9 pr-3 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <select
                  value={themeFilter}
                  onChange={(e) => setThemeFilter(e.target.value)}
                  className="h-9 border border-line/50 bg-ink-3/80 px-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All themes</option>
                  {themes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="overflow-x-auto border border-line/40 bg-ink-2/80 shadow-[3px_4px_0_#a4774b26]">
            <div className="min-w-[660px]">
            <div
              className={cn(
                "grid grid-cols-[3rem_1fr_5rem_6rem_3rem_4rem] gap-3 border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground",
                displayMode && "grid-cols-[4rem_1fr_7rem_8rem_4rem_5rem] py-3 text-xs",
              )}
            >
              <span>Rank</span>
              <span>Team</span>
              <span className="text-right">Score</span>
              <span className="text-right">Capital</span>
              <span className="text-center">Trend</span>
              <span className="text-right">Status</span>
            </div>
            <div className="divide-y divide-line/60">
              {rest.map((s) => {
                const delta = trends.get(s.team.id);
                const moved = delta !== undefined && delta !== 0;
                return (
                  <button
                    key={s.team.id}
                    onClick={() => setSelected(s)}
                    className={cn(
                      "grid w-full grid-cols-[3rem_1fr_5rem_6rem_3rem_4rem] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink-3/50",
                      displayMode && "grid-cols-[4rem_1fr_7rem_8rem_4rem_5rem] py-3",
                      moved && "pulse-row",
                    )}
                  >
                    <span
                      className={cn(
                        "font-mono text-muted-foreground",
                        displayMode ? "text-xl" : "text-sm",
                      )}
                    >
                      {String(s.rank).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate font-medium text-foreground",
                          displayMode && "text-lg",
                        )}
                      >
                        {s.team.name}
                      </span>
                      <span className="block truncate font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                        {s.team.team_code} · {s.team.theme}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "text-right font-mono text-foreground",
                        displayMode ? "text-xl" : "text-sm",
                      )}
                    >
                      {formatScore(s.total)}
                    </span>
                    <span
                      className={cn(
                        "text-right font-mono text-muted-foreground",
                        displayMode ? "text-lg" : "text-sm",
                      )}
                    >
                      {formatCapital(s.team.current_capital)}
                    </span>
                    <span className="text-center font-mono text-sm">
                      <TrendBadge delta={delta} />
                    </span>
                    <span
                      className={cn(
                        "text-right font-mono text-[11px]",
                        s.team.status === "active" ? "text-up" : "text-muted-foreground",
                      )}
                    >
                      {s.team.status === "active" ? "Active" : s.team.status}
                    </span>
                  </button>
                );
              })}
              {rest.length === 0 && !isLoading && (
                <div className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">
                  No teams match your search.
                </div>
              )}
            </div>
            </div>
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line/40 pt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>BIZZNNOVATE · IIPS DAVV</span>
          <span>Food & Nutrition · Health & Fitness · Fashion & Lifestyle</span>
        </footer>
      </div>

      {/* TEAM DETAIL */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="border-line bg-ink-2 text-foreground sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">
                  Team Detail · Rank {String(selected.rank).padStart(2, "0")}
                </div>
                <DialogTitle className="font-display text-3xl tracking-wide text-foreground">
                  {selected.team.name}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-ink-3/70 p-3 ring-1 ring-line">
                  <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    Total Score
                  </div>
                  <div className="mt-1 font-mono text-xl font-semibold text-foreground">
                    {formatScore(selected.total)}
                  </div>
                </div>
                <div className="rounded-lg bg-ink-3/70 p-3 ring-1 ring-line">
                  <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    Capital
                  </div>
                  <div className="mt-1 font-mono text-xl font-semibold text-foreground">
                    {formatCapital(selected.team.current_capital)}
                  </div>
                </div>
                <div className="rounded-lg bg-ink-3/70 p-3 ring-1 ring-line">
                  <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    Members
                  </div>
                  <div className="mt-1 font-mono text-xl font-semibold text-foreground">
                    {selected.team.members_count}
                  </div>
                </div>
              </div>
              {selected.team.acquired_business && (
                <div className="rounded-lg bg-gold/10 p-3 ring-1 ring-gold/30">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
                    Acquired Business
                  </span>
                  <div className="mt-0.5 text-sm font-medium text-foreground">
                    {selected.team.acquired_business}
                  </div>
                </div>
              )}
              <div className="space-y-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Activity Breakdown
                </div>
                {activities.map((a) => {
                  const pts = selected.scores[a.id];
                  const pct = pts !== undefined ? Math.min(100, (pts / a.max_score) * 100) : 0;
                  return (
                    <div key={a.id}>
                      <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
                        <span>
                          {a.name}
                          {a.status === "upcoming" && (
                            <span className="ml-2 text-muted-foreground/60">· upcoming</span>
                          )}
                        </span>
                        <span className="text-foreground">
                          {pts !== undefined ? `${formatScore(pts)} / ${a.max_score}` : "—"}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-4">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            a.status === "live" ? "bg-gold/80" : "bg-primary",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
