import fs from "fs";
import path from "path";
import type { IconDescriptor, Metadata } from "next";
import "./globals.css";

const publicDir = path.join(process.cwd(), "public");
const hasFaviconSvg = fs.existsSync(path.join(publicDir, "favicon.svg"));
const hasFaviconPng = fs.existsSync(path.join(publicDir, "favicon.png"));
const iconEntries = [
  hasFaviconSvg ? { url: "/favicon.svg", type: "image/svg+xml" } : null,
  hasFaviconPng ? { url: "/favicon.png", type: "image/png" } : null
].filter(Boolean) as IconDescriptor[];

const appleEntries = hasFaviconPng
  ? [{ url: "/favicon.png" }]
  : hasFaviconSvg
  ? [{ url: "/favicon.svg" }]
  : undefined;

const shortcutEntry = hasFaviconPng
  ? "/favicon.png"
  : hasFaviconSvg
  ? "/favicon.svg"
  : undefined;

export const metadata: Metadata = {
  title: "Roots of Sentient",
  description: "Share the Roots of Sentient word universe with Supabase.",
  icons: {
    icon: iconEntries.length > 0 ? iconEntries : undefined,
    shortcut: shortcutEntry,
    apple: appleEntries,
  },
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
