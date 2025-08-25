"use client";

import { useAuth } from "@clerk/nextjs";
import React from "react";

export function ClerkReady({ children }: { children: React.ReactNode }) {
  const { isLoaded } = useAuth();
  if (!isLoaded) return null;
  return <>{children}</>;
}
