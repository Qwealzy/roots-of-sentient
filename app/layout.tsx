import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roots of Sentient",
  description: "Share the Roots of Sentient word universe with Supabase."
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
