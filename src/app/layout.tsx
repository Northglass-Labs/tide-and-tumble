import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito, Pacifico } from "next/font/google";
import "./globals.css";
import Footer from "@/components/Footer";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fredoka",
});
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
});
const pacifico = Pacifico({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-pacifico",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tideandtumble.app"),
  title: {
    default: "Tide & Tumble — US Beach Tide Charts",
    template: "%s | Tide & Tumble",
  },
  description:
    "A whimsical, live tide chart for US beaches — the Outer Banks, Jersey Shore, Cape Fear coast, and more. See when the tide rolls in or slips out, with surfers, sea turtles, and crabs that swim along.",
  alternates: { canonical: "/" },
  applicationName: "Tide & Tumble",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tide & Tumble",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

// No maximumScale: pinch-zoom must stay available (accessibility).
export const viewport: Viewport = {
  themeColor: "#bfe9f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${nunito.variable} ${pacifico.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Footer />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
