import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.tagline,
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#f6f5f1",
    theme_color: "#0d6b63",
    orientation: "portrait",
    lang: "en-IN",
    categories: ["finance", "productivity", "news"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add transaction", url: "/money/transactions/new" },
      { name: "Today", url: "/today" },
    ],
  };
}
