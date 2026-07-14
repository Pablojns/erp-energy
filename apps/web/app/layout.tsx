import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/src/components/theme/theme-provider";
import { ClientObservabilityBootstrap } from "@/src/components/observability/client-observability-bootstrap";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Energy Brands — ERP",
  description: "Energy Brands — ERP de operações e expedição",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Energy ERP",
  },
  icons: {
    icon: "/logo-energy-icon.png",
    shortcut: "/logo-energy-icon.png",
    apple: "/logo-energy-icon.png",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2AACE2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full w-full antialiased`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2AACE2" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Energy ERP" />
        <link rel="apple-touch-icon" href="/logo-energy-icon.png" />
      </head>
      <body className="min-h-screen-safe flex w-full flex-col">
        <ClientObservabilityBootstrap />
        <ThemeProvider>{children}</ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
`,
          }}
        />
      </body>
    </html>
  );
}
