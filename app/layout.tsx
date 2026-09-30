import type { Metadata, Viewport } from "next";
import "./globals.css";
import BriefFab from "./BriefFab";
import PwaRegister from "./PwaRegister";

const BASE = "/Olle-pwa-";

export const metadata: Metadata = {
  title: "O.L.L.E. – Rogge Hub",
  description: "Rogges personliga assistent och livshubb",
  applicationName: "O.L.L.E.",
  manifest: `${BASE}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "O.L.L.E.",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: `${BASE}/olle-icon.svg`,
    apple: `${BASE}/olle-icon.svg`,
  },
};

export const viewport: Viewport = {
  themeColor: "#090b0e",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{children: React.ReactNode;}>) {
  return (
    <html lang="sv">
      <body>
        <PwaRegister />
        {children}
        <BriefFab />
      </body>
    </html>
  );
}
