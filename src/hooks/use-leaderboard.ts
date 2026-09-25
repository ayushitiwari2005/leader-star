import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  computeStandings,
  type Activity,
  type Score,
  type Standing,
  type Team,
} from "@/lib/leaderboard";

async function fetchAll() {
  const [teamsRes, activitiesRes, scoresRes] = await Promise.all([
    supabase.from("teams").select("*").order("team_code"),
    supabase.from("activities").select("*").order("sort_order"),
    supabase.from("scores").select("*"),
  ]);
  if (teamsRes.error) throw teamsRes.error;
  if (activitiesRes.error) throw activitiesRes.error;
  if (scoresRes.error) throw scoresRes.error;
  return {
    teams: teamsRes.data as Team[],
    activities: activitiesRes.data as Activity[],
    scores: scoresRes.data as Score[],
  };
}

export function useLeaderboard() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchAll,
    refetchOnWindowFocus: true,
  });

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveFlash, setLiveFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel("leaderboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "scores" }, () => {
        setLiveFlash("Scores updated");
        setLastUpdated(new Date());
        void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => {
        setLiveFlash("Teams updated");
        setLastUpdated(new Date());
        void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => {
        setLiveFlash("Activities updated");
        setLastUpdated(new Date());
        void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!liveFlash) return;
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setLiveFlash(null), 3500);
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [liveFlash]);

  useEffect(() => {
    if (query.data && !lastUpdated) setLastUpdated(new Date());
  }, [query.data, lastUpdated]);

  const standings: Standing[] = query.data
    ? computeStandings(query.data.teams, query.data.activities, query.data.scores)
    : [];

  // Track previous ranks for trend indicators
  const prevRanks = useRef<Map<string, number>>(new Map());
  const [trends, setTrends] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (standings.length === 0) return;
    const next = new Map<string, number>();
    const prev = prevRanks.current;
    if (prev.size > 0) {
      for (const s of standings) {
        const before = prev.get(s.team.id);
        if (before !== undefined && before !== s.rank) {
          next.set(s.team.id, before - s.rank); // positive = moved up
        }
      }
    }
    prevRanks.current = new Map(standings.map((s) => [s.team.id, s.rank]));
    setTrends(next);
  }, [standings]);

  return {
    teams: query.data?.teams ?? [],
    activities: query.data?.activities ?? [],
    scores: query.data?.scores ?? [],
    standings,
    trends,
    lastUpdated,
    liveFlash,
    isLoading: query.isLoading,
    error: query.error,
  };
}
