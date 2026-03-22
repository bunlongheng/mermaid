import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "hsl(285,90%,52%)",
};

export const metadata: Metadata = {
  title: "Diagrams",
  description: "Beautiful diagram generator — paste any diagram syntax and get a polished visual instantly.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://diagram-bheng.vercel.app"),
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Diagrams",
  },
  openGraph: {
    title: "Diagrams — Sequence Diagram Generator",
    description: "Paste diagram syntax, get beautiful diagrams instantly.",
    type: "website",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://diagram-bheng.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Diagrams — Sequence Diagram Generator",
    description: "Paste diagram syntax, get beautiful diagrams instantly.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
