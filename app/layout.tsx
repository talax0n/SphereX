import type { Metadata } from "next";
import { Inter, Syne } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  style: ["normal", "italic"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const description =
  "Theo Niomba, fullstack engineer in Indonesia. Walk a tiny clay planet and open each station's book to read my projects, experience, skills and awards.";

export const metadata: Metadata = {
  metadataBase: new URL("https://theola.dev"),
  title: "Theo Niomba · Fullstack Engineer",
  description,
  openGraph: { title: "Theo Niomba · Fullstack Engineer", description, url: "/", siteName: "SphereX", type: "website" },
  twitter: { card: "summary", title: "Theo Niomba · Fullstack Engineer", description },
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
