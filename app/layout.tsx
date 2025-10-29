// app/layout.tsx
import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import "./globals.css";

type IconEntry = { url: string; type?: string; sizes?: string };

const publicDir = path.join(process.cwd(), "public");
const hasFaviconSvg = fs.existsSync(path.join(publicDir, "favicon.svg"));
const hasFaviconPng = fs.existsSync(path.join(publicDir, "favicon.png"));
const hasAppleIcon = fs.existsSync(path.join(publicDir, "apple-touch-icon.png"));

const iconEntries = [
  hasFaviconSvg ? { url: "/favicon.svg", type: "image/svg+xml" } : null,
  hasFaviconPng ? { url: "/favicon.png", type: "image/png" } : null,
].filter((x): x is IconEntry => x !== null); // tipli filter

const appleEntries = hasAppleIcon ? [{ url: "/apple-touch-icon.png" }] : undefined;

const shortcutEntry =
  hasFaviconPng ? "/favicon.png" :
  hasFaviconSvg ? "/favicon.svg" : undefined;

export const metadata: Metadata = {
  title: "Roots of Sentient",
  description: "Share the Roots of Sentient word universe with Supabase.",
  themeColor: "#ff5a84",
  manifest: "/site.webmanifest", // varsa
  icons: {
    icon: iconEntries.length ? iconEntries as IconEntry[] : undefined,
    apple: appleEntries,
    shortcut: shortcutEntry,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
