import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { CV } from "@/data/cv";
import "./globals.css";

const sans = Geist({ variable: "--font-geist", subsets: ["latin"] });

const mono = JetBrains_Mono({
  variable: "--font-jb",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://theola.dev"),
  title: CV.name,
  description: CV.summary,
  openGraph: { title: CV.name, description: CV.summary, url: "/", siteName: CV.name, type: "website" },
  twitter: { card: "summary", title: CV.name, description: CV.summary },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
