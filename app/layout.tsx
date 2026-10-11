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

const description =
  "Theo Niomba, fullstack engineer in Indonesia. Walk a tiny clay planet and open each station's book to read my projects, experience, skills and awards.";

export const metadata: Metadata = {
  metadataBase: new URL("https://theola.dev"),
  title: "Theo Niomba · Fullstack Engineer",
  description,
  openGraph: { title: "Theo Niomba · Fullstack Engineer", description, url: "/", siteName: "SphereX", type: "website" },
  twitter: { card: "summary", title: "Theo Niomba · Fullstack Engineer", description },
};

const INTRO_SEEN = `try{localStorage.getItem("hq:intro")==="1"&&(document.documentElement.dataset.introSeen="")}catch(e){}`;

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
    // the script flags returning visitors before first paint, so the server-rendered intro never flashes for them
    <html lang="en" className={`${inter.variable} ${syne.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_SEEN }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
