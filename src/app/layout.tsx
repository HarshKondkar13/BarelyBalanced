import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { brand } from "@/lib/brand";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.tagline,
  applicationName: brand.name,
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07080f",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const jar = await cookies();
  // Neon Night unless the user chose a Classic theme ("system" follows the device).
  const saved = jar.get("pp_theme")?.value;
  const theme = saved === "light" || saved === "dark" || saved === "system" ? saved : "neon";
  const accent = jar.get("pp_accent")?.value;
  return (
    <html
      lang="en-IN"
      data-theme={theme === "system" ? undefined : theme}
      data-accent={accent && /^[a-z]+$/.test(accent) ? accent : undefined}
      className="h-full antialiased"
    >
      <body className="min-h-full">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
