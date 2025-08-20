import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@copilotkit/react-ui/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { ConversationsProvider } from "@/context/conversations";
import SidebarAppShell from "@/components/SidebarAppShell";
import { Toaster } from "@/components/ui/sonner";
import { SignedIn, SignedOut } from "@clerk/nextjs";
//import { Analytics } from "@vercel/analytics/next";
//import { SpeedInsights } from "@vercel/speed-insights/next";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BeeNet - AI Research Without Limits",
  description: "Unlike Perplexity's restrictions, BeeNet gives you unlimited research with your own API keys, custom models, and enterprise-grade security. Start free today.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <Providers>
          <SignedIn>
            <ConversationsProvider>
              <SidebarAppShell>{children}</SidebarAppShell>
            </ConversationsProvider>
          </SignedIn>
          <SignedOut>
            {children}
          </SignedOut>
          <Toaster richColors />
        </Providers>
      </body>
    </html>
  );
}
