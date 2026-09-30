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
      <body className="min-h-dvh">
        <a href="#contenuto" className="skip-link">
          {T.app.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
