export interface Team {
  id: string;
  team_code: string;
  name: string;
  theme: string;
  members_count: number;
  acquired_business: string | null;
  initial_capital: number;
  current_capital: number;
  status: string;
}

export interface Activity {
  id: string;
  name: string;
  description: string | null;
  day: number;
  max_score: number;
  weight: number;
  status: "upcoming" | "live" | "completed" | "disabled";
  sort_order: number;
}

export interface Score {
  id: string;
  team_id: string;
  activity_id: string;
  points: number;
  remarks: string | null;
  entered_by: string | null;
  version: number;
  updated_at: string;
}

export interface Standing {
  team: Team;
  rank: number;
  total: number;
  boardroom: number;
  scores: Record<string, number>; // activityId -> points
}

/**
 * Ranking is derived, never stored:
 *  1. Weighted total of scores from live/completed activities (desc)
 *  2. The Boardroom score (desc)
 *  3. Current virtual capital (desc)
 *  4. Team code (asc) — fully deterministic
 */
export function computeStandings(
  teams: Team[],
  activities: Activity[],
  scores: Score[],
): Standing[] {
  const counted = new Set(
    activities.filter((a) => a.status === "live" || a.status === "completed").map((a) => a.id),
  );
  const boardroom = activities.find((a) => a.name === "The Boardroom");
  const weightOf = new Map(activities.map((a) => [a.id, a.weight]));

  const byTeam = new Map<string, Score[]>();
  for (const s of scores) {
    if (!counted.has(s.activity_id)) continue;
    const list = byTeam.get(s.team_id) ?? [];
    list.push(s);
    byTeam.set(s.team_id, list);
  }

  const standings: Standing[] = teams.map((team) => {
    const list = byTeam.get(team.id) ?? [];
    let total = 0;
    let board = 0;
    const map: Record<string, number> = {};
    for (const s of list) {
      total += s.points * (weightOf.get(s.activity_id) ?? 1);
      map[s.activity_id] = s.points;
      if (boardroom && s.activity_id === boardroom.id) board = s.points;
    }
    return { team, rank: 0, total, boardroom: board, scores: map };
  });

  standings.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.boardroom !== a.boardroom) return b.boardroom - a.boardroom;
    if (b.team.current_capital !== a.team.current_capital)
      return b.team.current_capital - a.team.current_capital;
    return a.team.team_code.localeCompare(b.team.team_code);
  });

  standings.forEach((s, i) => {
    s.rank = i + 1;
  });
  return standings;
}

export function formatScore(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(n);
}

export function formatCapital(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${new Intl.NumberFormat("en-IN").format(n)}`;
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
