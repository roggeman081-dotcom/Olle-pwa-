export const dynamic = "force-static";

import type { MetadataRoute } from "next";

const BASE = "/Olle-pwa-";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "O.L.L.E. – Rogge Hub",
    short_name: "O.L.L.E.",
    description: "Rogges personliga assistent och livshubb",
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: "standalone",
    background_color: "#090b0e",
    theme_color: "#090b0e",
    orientation: "portrait",
    icons: [
      {
        src: `${BASE}/olle-icon.svg`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
