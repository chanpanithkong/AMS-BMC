import type { Metadata } from "next";
import { Inter, Noto_Sans_Khmer } from "next/font/google";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Providers, SplashScreen } from "@/components/providers/providers";
import { isLocale, locales } from "@/lib/i18n/config";
import en from "@/messages/en.json";
import km from "@/messages/km.json";
import "../globals.css";

// Inter for Latin text, Noto Sans Khmer for Khmer (prompt §1, SRS NFR-LOC-001).
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const khmer = Noto_Sans_Khmer({ variable: "--font-khmer", subsets: ["khmer"], display: "swap" });

const messages = { en, km };

export const metadata: Metadata = {
  title: "AMS — Accounting Management System",
  description: "Accounting Management System for Cambodian SMEs",
};

// The app is rendered on the client behind sign-in (data comes from the API, not from Server
// Components), so routes opt out of instant-navigation validation.
export const instant = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale} className={`${inter.variable} ${khmer.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <Suspense fallback={<SplashScreen />}>
          <Providers locale={locale} messages={messages[locale]}>
            {children}
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
