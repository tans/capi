import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { Hero } from "@/components/home/hero";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Logo } from "@/components/logo";
import { LanguageSegmented, LanguageSwitcher } from "@/components/language-switcher";
import { LocaleProvider } from "@/components/locale-context";
import { AccountMenu } from "@/components/dashboard/account-menu";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { WorkspaceSwitcher } from "@/components/dashboard/workspace-switcher";
import { getDictionary } from "@/lib/i18n";
import { localeHref, type Locale } from "@/lib/i18n/config";
import { KeysPage, UsagePage, NewWorkspacePage } from "./console-pages";
import { useResource, type User, type Workspace } from "./api";

export function Feedback({ loading, error, locale }: { loading?: boolean; error?: Error; locale: Locale }) {
  if (loading) return <div role="status" className="flex items-center gap-3 py-10 text-sm text-muted-foreground"><span className="loading loading-spinner loading-sm" />{locale === "zh" ? "正在加载…" : "Loading…"}</div>;
  if (error) return <div role="alert" className="alert alert-error"><span>{error.message}</span><button className="btn btn-sm" onClick={() => window.dispatchEvent(new Event("capi:refresh"))}>{locale === "zh" ? "重试" : "Retry"}</button></div>;
  return null;
}

function AuthPage({ locale, mode }: { locale: Locale; mode: "login" | "signup" }) {
  const t = getDictionary(locale);
  return <div className="flex min-h-screen flex-col bg-muted/30">
    <header className="border-b border-border bg-background"><div className="container-page flex h-14 items-center justify-between"><Link href={localeHref(locale, "/")} aria-label={t.common.homeAria}><Logo /></Link><div className="flex items-center gap-5"><Link href={localeHref(locale, "/")} className="text-xs text-muted-foreground">{t.auth.backToSite}</Link><LanguageSegmented locale={locale} /></div></div></header>
    <main className="flex flex-1 items-center justify-center px-5 py-12"><div className="w-full max-w-sm"><h1 className="display-3">{t.auth[mode].title}</h1><p className="mt-2 text-[13px] text-muted-foreground">{t.auth[mode].description}</p><div className="mt-8"><AuthForm mode={mode} dict={t.auth} localePrefix={`/${locale}`} /></div></div></main>
    <footer className="border-t border-border bg-background"><div className="container-page flex items-center justify-between py-5 text-xs text-muted-foreground"><span>© {new Date().getFullYear()} CAPI</span><div className="flex gap-4"><Link href={localeHref(locale, "/terms")}>{t.nav.terms}</Link><Link href={localeHref(locale, "/privacy")}>{t.nav.privacy}</Link></div></div></footer>
  </div>;
}

function WorkspaceList({ locale }: { locale: Locale }) {
  const state = useResource<{ data: Workspace[] }>("/api/workspaces");
  const t = getDictionary(locale);
  return <><h1 className="text-[22px] font-semibold">{t.dashboard.components.nav.workspace}</h1><Feedback {...state} locale={locale} />{state.data && <section className="mt-6 overflow-hidden rounded-md border border-border bg-card"><ul className="divide-y divide-border">{(state.data.data ?? []).map(workspace => <li key={workspace.id}><Link href={localeHref(locale, `/dashboard/w/${workspace.id}`)} className="flex items-center justify-between px-5 py-4 hover:bg-muted"><span className="font-medium">{workspace.name}</span><span className="badge badge-ghost">{workspace.role}</span></Link></li>)}</ul>{!state.data.data?.length && <p className="p-8 text-sm text-muted-foreground">{locale === "zh" ? "暂无工作区" : "No workspaces yet"}</p>}</section>}</>;
}

function Dashboard({ locale }: { locale: Locale }) {
  const state = useResource<{ user: User }>("/api/auth/me");
  const location = useLocation();
  const t = getDictionary(locale);
  if (state.error?.status === 401) return <Navigate to={`${localeHref(locale, "/login")}?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!state.data) return <main className="container-page py-10"><Feedback {...state} locale={locale} /></main>;
  const user = state.data.user;
  const navUser = { permissions: user.role === "admin" ? ["admin:access"] : [] };
  return <div className="flex min-h-screen flex-col bg-muted/20">
    <header className="sticky top-0 z-40 border-b border-border bg-background"><div className="container-page flex h-14 min-w-0 items-center justify-between gap-4"><Link className="shrink-0" href={localeHref(locale, "/")} aria-label={t.common.homeAria}><Logo /></Link><div className="flex min-w-0 items-center gap-3"><Link href={localeHref(locale, "/docs")} className="hidden text-[13px] text-muted-foreground sm:inline">{t.nav.docs}</Link><LanguageSwitcher locale={locale} compact /><WorkspaceSwitcher locale={locale} /><AccountMenu locale={locale} user={user} labels={{ trigger: t.common.accountAria, management: t.dashboard.account.title, signOut: t.common.signOut, signOutError: t.common.signOutError }} destination={localeHref(locale, "/")} /></div></div></header>
    <div className="container-page flex-1 py-8"><div className="grid gap-8 lg:grid-cols-[190px_minmax(0,1fr)]"><aside className="hidden lg:block"><div className="sticky top-24"><AppSidebar locale={locale} user={navUser} /></div></aside><main className="min-w-0"><div className="mb-6 overflow-x-auto lg:hidden"><AppSidebar locale={locale} user={navUser} className="flex-row gap-1" /></div><Routes><Route index element={<WorkspaceList locale={locale} />} /><Route path="workspaces/new" element={<NewWorkspacePage locale={locale} />} /><Route path="w/:workspaceId" element={<UsagePage locale={locale} view="overview" />} /><Route path="w/:workspaceId/keys" element={<KeysPage locale={locale} />} /><Route path="w/:workspaceId/usage" element={<UsagePage locale={locale} />} /><Route path="w/:workspaceId/logs" element={<UsagePage locale={locale} view="logs" />} /><Route path="w/:workspaceId/billing" element={<UsagePage locale={locale} view="billing" />} /><Route path="*" element={<PendingPage locale={locale} />} /></Routes></main></div></div>
  </div>;
}

function PendingPage({ locale }: { locale: Locale }) {
  return <section className="py-12"><h1 className="text-xl font-semibold">{locale === "zh" ? "页面正在迁移" : "Page migration in progress"}</h1><p className="mt-3 text-sm text-muted-foreground">{locale === "zh" ? "此页面尚未恢复，可暂时使用原 Go 控制台。" : "This page is being restored. The original Go console remains available."}</p><a className="btn btn-sm mt-5" href="/legacy">{locale === "zh" ? "打开原控制台" : "Open original console"}</a></section>;
}

export function App() {
  const location = useLocation();
  const locale: Locale = location.pathname.split("/")[1] === "zh" ? "zh" : "en";
  useEffect(() => { document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"; }, [locale]);
  if (!/^\/(en|zh)(\/|$)/.test(location.pathname)) {
    const preferred = document.cookie.includes("CAPI_LOCALE=zh") ? "zh" : "en";
    return <Navigate to={`/${preferred}${location.pathname === "/" ? "" : location.pathname}${location.search}${location.hash}`} replace />;
  }
  return <LocaleProvider locale={locale}><Routes>
    <Route path="/:locale/login" element={<AuthPage locale={locale} mode="login" />} />
    <Route path="/:locale/signup" element={<AuthPage locale={locale} mode="signup" />} />
    <Route path="/:locale/dashboard/*" element={<Dashboard locale={locale} />} />
    <Route path="*" element={<><SiteHeader locale={locale} /><main><Routes><Route path="/:locale" element={<Hero locale={locale} />} /><Route path="*" element={<div className="container-page"><PendingPage locale={locale} /></div>} /></Routes></main><SiteFooter locale={locale} /></>} />
  </Routes></LocaleProvider>;
}
