// app/layout.tsx
import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import "./globals.css";

export const runtime = "nodejs"; // fs/path kullanıyorsan güvenli

type IconEntry = { url: string; type?: string; sizes?: string };
const isNotNull = <T,>(x: T | null | undefined): x is T => x != null;

const publicDir = path.join(process.cwd(), "public");

// Dosya adlarını kendi projene göre ayarla (aşağıdakiler önerilen isimler)
const hasSvg = fs.existsSync(path.join(publicDir, "favicon.svg"));
const hasPng32 = fs.existsSync(path.join(publicDir, "favicon-32x32.png"));
const hasApple = fs.existsSync(path.join(publicDir, "apple-touch-icon.png"));

// Diziyi baştan (IconEntry | null)[] olarak ANOTLUYORUZ
const rawIconEntries: (IconEntry | null)[] = [
  hasSvg   ? { url: "/favicon.svg", type: "image/svg+xml" } : null,
  hasPng32 ? { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" } : null,
];

const iconEntries = rawIconEntries.filter(isNotNull);

export const metadata: Metadata = {
  title: "Roots of Sentient",
  description: "Share the Roots of Sentient word universe with Supabase.",
  themeColor: "#ff5a84",
  manifest: "/site.webmanifest", // varsa
  icons: {
    icon: iconEntries.length ? iconEntries : undefined,
    apple: hasApple ? [{ url: "/apple-touch-icon.png" }] : undefined,
    // shortcut olarak ICO kullanmak en uyumlu:
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
