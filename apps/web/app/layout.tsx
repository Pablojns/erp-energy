import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/src/components/theme/theme-provider";
import { ThemeScript } from "@/src/components/theme/theme-script";
import { ClientObservabilityBootstrap } from "@/src/components/observability/client-observability-bootstrap";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ERP Energy",
  description: "ERP Energy — operações e expedição",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${inter.variable} h-full w-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body
        className="min-h-screen-safe flex w-full flex-col"
        suppressHydrationWarning={true}
      >
        <ClientObservabilityBootstrap />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
