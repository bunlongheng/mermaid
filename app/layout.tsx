import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "hsl(285,90%,52%)",
};

export const metadata: Metadata = {
  title: "Mermaid++",
  description: "Beautiful sequence diagram generator — paste any mermaid sequence syntax and get a polished visual instantly.",
  metadataBase: new URL("https://mermaid-bheng.vercel.app"),
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mermaid++",
  },
  openGraph: {
    title: "Mermaid++ — Sequence Diagram Generator",
    description: "Paste mermaid syntax, get beautiful sequence diagrams instantly.",
    type: "website",
    url: "https://mermaid-bheng.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mermaid++ — Sequence Diagram Generator",
    description: "Paste mermaid syntax, get beautiful sequence diagrams instantly.",
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
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
