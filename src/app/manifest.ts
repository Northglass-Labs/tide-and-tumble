import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tide & Tumble — US Beach Tide Charts",
    short_name: "Tide & Tumble",
    description:
      "A whimsical, live tide chart for US beaches — see the tide roll in or slip out.",
    start_url: "/",
    display: "standalone",
    background_color: "#e8f7f5",
    theme_color: "#bfe9f2",
    orientation: "portrait",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
