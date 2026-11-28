import type { Metadata, Viewport } from "next";
import "./globals.css";
import MessageNotifier from "@/components/MessageNotifier";
import NotificationPrompt from "@/components/NotificationPrompt";
import PresenceManager from "@/components/PresenceManager";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  metadataBase: new URL("https://palsy-app.vercel.app"),
  title: "PALSY ♡ — Your Little Corner of Friendship",
  description:
    "A cute, cozy and private digital hangout for friends — real-time chats, rooms and games to play together.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "PALSY ♡ — Your Little Corner of Friendship",
    description:
      "A cute, cozy and private digital hangout for friends — real-time chats, rooms and games to play together.",
    url: "https://palsy-app.vercel.app",
    siteName: "PALSY",
    type: "website",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "PALSY" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PALSY ♡ — Your Little Corner of Friendship",
    description:
      "A cute, cozy and private digital hangout for friends — real-time chats, rooms and games to play together.",
    images: ["/icon-512.png"],
  },
  robots: { index: true, follow: true },
  authors: [{ name: "Zainab Rehman-ZR" }],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PALSY",
  },
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "PALSY",
  alternateName: "palsy-app",
  url: "https://palsy-app.vercel.app",
  creator: "Zainab Rehman-ZR",
  applicationCategory: "SocialNetworkingApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "A cute, cozy and private digital hangout for friends — real-time chats, rooms and games to play together.",
};

export const viewport: Viewport = {
  themeColor: "#FF6B9D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full theme-bg theme-text antialiased" style={{ fontFamily: "'Nunito', sans-serif" }}>
        {children}
        <MessageNotifier />
        <NotificationPrompt />
        <PresenceManager />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
