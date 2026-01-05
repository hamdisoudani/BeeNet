"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { CopilotKit } from "@copilotkit/react-core";
import { useAuth } from "@clerk/nextjs";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const { getToken } = useAuth();

  // Use a state to hold the token so CopilotKit re-initializes when token is available
  const [token, setToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const t = await getToken();
      setToken(t);
    })();
  }, [getToken]);

  if (!params?.id) return null;

  return (
    <CopilotKit
      runtimeUrl={process.env.NEXT_PUBLIC_COPILOTKIT_RUNTIME_URL || "http://localhost:8000/copilotkit"}
      agent="starterAgent"
      showDevConsole={false}
      publicLicenseKey="ck_pub_fa79034fd22de4f39fafa83479af81db"
      threadId={params.id}
      headers={token ? { Authorization: `Bearer ${token}` } : {}}
    >
      {children}
    </CopilotKit>
  );
}



