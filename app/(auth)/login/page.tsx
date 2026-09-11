import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the Capi dashboard.",
};

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm">
      <h1 className="display-3 text-foreground">Sign in</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Welcome back. Pick up where you left off.
      </p>
      <div className="mt-8">
        <AuthForm mode="login" />
      </div>
    </div>
  );
}
