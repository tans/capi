import { forwardRef, type AnchorHTMLAttributes } from "react";
import { Link as RouterLink } from "react-router-dom";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean };
const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, prefetch: _prefetch, ...props }, ref) {
  if (!href.startsWith("/") || href.startsWith("//")) return <a ref={ref} href={href} {...props} />;
  return <RouterLink ref={ref} to={href} {...props} />;
});
export default Link;
