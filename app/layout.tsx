import type { Metadata } from "next";
import { Inter, Syne } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const title = "Theo · Under construction";
const description = "I'm rebuilding theola.dev from scratch. My little builder bot is on the job until the new site is ready.";

export const metadata: Metadata = {
  metadataBase: new URL("https://theola.dev"),
  title,
  description,
  openGraph: { title, description, url: "/", siteName: "SphereX", type: "website" },
  twitter: { card: "summary", title, description },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${syne.variable}`}>
      <body>{children}</body>
    </html>
  );
}
