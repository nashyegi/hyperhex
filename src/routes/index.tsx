import { createFileRoute } from "@tanstack/react-router";
import { Workbench } from "@/components/Workbench";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "HyperHex — Low-Altitude Drone Corridors" },
      { name: "description", content: "Simulate 4D hexagonal drone corridors for UTM: low-altitude flight space shared by autonomous drones across hex tiles, altitude layers and time." },
      { property: "og:title", content: "HyperHex — Low-Altitude Drone Corridors" },
      { property: "og:description", content: "Hex tiles × altitude × time: watch drones share low-altitude corridors, deconflict and replan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#fcfcfc", media: "(max-width: 1023px)" },
      { name: "color-scheme", content: "light", media: "(max-width: 1023px)" },
    ],
  }),
  component: Workbench,
});
