import type { Metadata } from "next";
import "./globals.css";
import MessageNotifier from "@/components/MessageNotifier";
import PresenceManager from "@/components/PresenceManager";

export const metadata: Metadata = {
  title: "PALSY ♡ — Your Little Corner of Friendship",
  description: "A cute, cozy and private digital hangout for friends.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full theme-bg theme-text antialiased" style={{ fontFamily: "'Nunito', sans-serif" }}>
        {children}
        <MessageNotifier />
        <PresenceManager />
      </body>
    </html>
  );
}
