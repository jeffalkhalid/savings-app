import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cockpit",
    short_name: "Cockpit",
    start_url: "/cockpit",
    display: "standalone",
    background_color: "#FAF8F4",
    theme_color: "#FAF8F4",
  };
}
