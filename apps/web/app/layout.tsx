import type { Metadata } from "next";
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
  icons: {
    icon: "/brand/energy-e-icon.png",
    shortcut: "/brand/energy-e-icon.png",
    apple: "/brand/energy-e-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full w-full antialiased`}>
      <body
        className="min-h-screen-safe flex w-full flex-col"
      >
        <ClientObservabilityBootstrap />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
