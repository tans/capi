import type { Metadata } from "next";

import { KeyManager } from "@/components/dashboard/key-manager";

export const metadata: Metadata = {
  title: "API Keys",
  description: "Create, scope, and revoke API keys.",
};

export default function KeysPage() {
  return <KeyManager />;
}
