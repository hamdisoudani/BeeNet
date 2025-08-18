"use client";

import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <SignIn appearance={{ elements: { card: "shadow-lg" } }} />
    </div>
  );
}


