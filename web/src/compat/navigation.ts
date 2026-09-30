import { useMemo } from "react";
import { useLocation, useNavigate, useParams as routerParams } from "react-router-dom";

export function refresh() { window.dispatchEvent(new Event("capi:refresh")); }
export function usePathname() { return useLocation().pathname; }
export function useSearchParams() { return new URLSearchParams(useLocation().search); }
export function useParams() { return routerParams(); }
export function useRouter() {
  const navigate = useNavigate();
  return useMemo(() => ({
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1), refresh,
  }), [navigate]);
}
