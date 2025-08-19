"use client";

import { ClerkProvider, SignedIn, useAuth } from "@clerk/nextjs";
import { ThemeProvider } from "next-themes";
import "@copilotkit/react-ui/styles.css";
import React from "react";
import { useModelStore } from "@/stores/modelStore";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <SignedIn>
          <StatusBootstrap />
        </SignedIn>
        {children}
      </ThemeProvider>
    </ClerkProvider>
  );
}

function StatusBootstrap() {
  const { setStatus } = useModelStore();
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/secrets/status', { method: 'GET', credentials: 'include', cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setStatus(Boolean(data?.hasModel), Boolean(data?.hasTavilyKey));
      } catch {}
    })();
  }, [setStatus]);
  return null;
}


