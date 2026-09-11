import Link from "next/link";

import { Logo } from "@/components/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="container-page flex h-14 items-center justify-between">
          <Link href="/" aria-label="Capi home">
            <Logo />
          </Link>
          <Link
            href="/"
            className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            Back to site
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-12">
        {children}
      </main>

      <footer className="border-t border-border bg-background">
        <div className="container-page flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} Capi
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/terms"
              className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
            >
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
