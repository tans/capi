import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "0.0006" + "1K tokens" -> "from $0.0006 / 1K tokens" */
export function formatPrice(amount: string, unit: string, prefix = "from") {
  return `${prefix} $${amount} / ${unit}`;
}

/** 1234 -> "1,234" */
export function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

/** 41234567 -> "$41,234.57" */
export function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

/** Slugify a heading into an anchor id. */
export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
