import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Capi account and get free starter credits.",
};

export default function SignupPage() {
  return (
    <div className="w-full max-w-sm">
      <h1 className="display-3 text-foreground">Create your account</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Free starter credits are included. No credit card required.
      </p>
      <div className="mt-8">
        <AuthForm mode="signup" />
      </div>
    </div>
  );
}
