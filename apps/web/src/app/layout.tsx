import type { Metadata, Viewport } from "next";
import { T } from "@arthur/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: T.app.name,
  description: T.app.tagline,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        {/* Font self-hosted precaricati, così i titoli non partono col font di ripiego */}
        <link rel="preload" href="/fonts/ClashDisplay-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Satoshi-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="min-h-dvh">
        <a href="#contenuto" className="skip-link">
          {T.app.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
