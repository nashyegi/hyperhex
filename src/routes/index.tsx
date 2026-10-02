import { createFileRoute } from "@tanstack/react-router";
import { Workbench } from "@/components/Workbench";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "HyperHex — 4D Airspace Reservation Workbench" },
      { name: "description", content: "Simulate 4D hexagonal airspace reservations, conflicts and replanning for autonomous drones." },
      { property: "og:title", content: "HyperHex — 4D Airspace Reservation Workbench" },
      { property: "og:description", content: "H3 hex voxels × altitude × time: watch drones reserve, conflict and replan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workbench,
});
