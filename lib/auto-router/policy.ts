import type { ComplexityTier } from "./classifier";
export type AutoRoutePolicy = { light: string; standard: string; advanced: string; defaultTier: ComplexityTier; allowPlatform: boolean; sticky: boolean };
export const defaultAutoRoutePolicy: AutoRoutePolicy = { light: "gpt-4o-mini", standard: "gpt-4o", advanced: "gpt-5.5", defaultTier: "standard", allowPlatform: true, sticky: true };
