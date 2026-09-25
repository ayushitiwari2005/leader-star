import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardView } from "@/components/LeaderboardView";

export const Route = createFileRoute("/display")({
  head: () => ({
    meta: [
      { title: "BIZZNNOVATE — Display Mode | Live Leaderboard" },
      {
        name: "description",
        content:
          "Projector-optimized live leaderboard for BIZZNNOVATE at IIPS, DAVV. Large type, high contrast, no controls.",
      },
      { property: "og:title", content: "BIZZNNOVATE — Display Mode" },
      {
        property: "og:description",
        content: "Projector-optimized live leaderboard for BIZZNNOVATE at IIPS, DAVV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DisplayPage,
});

function DisplayPage() {
  return <LeaderboardView displayMode />;
}
