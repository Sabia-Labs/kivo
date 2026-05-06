import type { Metadata } from "next";
import { Inter, Geist_Mono, Figtree } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Kivo — AI Engineering Agent Platform",
  description:
    "Deploy, configure, and operate autonomous AI engineering agent teams at scale. Kivo is the production-ready framework for deploying OpenClaw-based agents into any infrastructure.",
  keywords: [
    "AI agents",
    "autonomous software engineers",
    "Kubernetes agents",
    "AI developer platform",
    "Kivo",
  ],
  openGraph: {
    title: "Kivo — AI Engineering Agent Platform",
    description:
      "Deploy autonomous AI engineering teams at scale inside your own infrastructure.",
    type: "website",
  },
};

const figtree = Figtree({subsets:['latin'],variable:'--font-sans'});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
              "antialiased",
              fontMono.variable
            , "font-sans", figtree.variable)}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `window.__ENV = ${JSON.stringify({ SITE_URL: process.env.NEXT_PUBLIC_SITE_URL })};` }} />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <Navbar />
              <main className="pt-16">{children}</main>
              <Toaster richColors position="top-right" />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

