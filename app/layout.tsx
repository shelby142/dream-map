import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dream Map — Explore dreams around the world",
  description: "Explore dreams and dreamers on a world map. Share your dream, vote, or offer help.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
