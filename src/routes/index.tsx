import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardView } from "@/components/LeaderboardView";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BIZZNNOVATE — Live Leaderboard | IIPS DAVV" },
      {
        name: "description",
        content:
          "Real-time rankings for all 30 teams at BIZZNNOVATE, the inter-college business competition by IIPS, DAVV.",
      },
      { property: "og:title", content: "BIZZNNOVATE — Live Leaderboard" },
      {
        property: "og:description",
        content:
          "Real-time rankings for all 30 teams at BIZZNNOVATE, the inter-college business competition by IIPS, DAVV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <LeaderboardView />;
}
