import { createFileRoute } from "@tanstack/react-router";
import { Workbench } from "@/components/Workbench";

const TITLE = "HyperHex by Naresh Yegireddi: Urban Drone Corridor Simulator";
const DESC =
  "HyperHex, founded by Naresh Yegireddi, is a research simulator for urban low-altitude drone corridors using H3 hex cells, altitude layers, and time slots.";

const PERSON = {
  "@type": "Person",
  "@id": "https://hyperhex.dev/#naresh-yegireddi",
  name: "Naresh Yegireddi",
  jobTitle: "Founder, HyperHex",
  description: "Naresh Yegireddi is the founder and creator of HyperHex, an urban low-altitude drone corridor research simulator.",
  url: "https://www.linkedin.com/in/nareshyegireddi",
  address: { "@type": "PostalAddress", addressLocality: "Little Elm", addressRegion: "TX", addressCountry: "US" },
  knowsAbout: ["H3 geospatial indexing", "urban low-altitude drone corridors", "UTM", "safe interval path planning", "distributed systems"],
  sameAs: ["https://www.linkedin.com/in/nareshyegireddi", "https://github.com/nashyegi"],
};

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      {
        name: "keywords",
        content:
          "Naresh Yegireddi, HyperHex founder Naresh Yegireddi, HyperHex, urban low-altitude drone corridors, drone traffic, UTM, Unmanned Aircraft System Traffic Management, H3, hexagonal indexing, safe interval path planning, SIPP, drone deconfliction, 4D reservations",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "https://hyperhex.dev/" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
      { name: "theme-color", content: "#fcfcfc", media: "(max-width: 1023px)" },
      { name: "color-scheme", content: "light", media: "(max-width: 1023px)" },
    ],
    links: [{ rel: "canonical", href: "https://hyperhex.dev/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "HyperHex",
          url: "https://hyperhex.dev/",
          applicationCategory: "ResearchApplication",
          operatingSystem: "Web",
          license: "https://www.gnu.org/licenses/agpl-3.0.html",
          codeRepository: "https://github.com/nashyegi/hyperhex",
          description: DESC,
          author: {
            "@type": "Person",
            name: "Naresh Yegireddi",
            url: "https://www.linkedin.com/in/nareshyegireddi",
            sameAs: ["https://www.linkedin.com/in/nareshyegireddi", "https://github.com/nashyegi"],
          },
        }),
      },
    ],
  }),
  component: Workbench,
});
