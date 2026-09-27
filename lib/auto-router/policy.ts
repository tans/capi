import type { JevComplexity } from "../jev/types";
export type AutoRoutePolicy = { light: string; standard: string; advanced: string; defaultTier: JevComplexity; allowPlatform: boolean; sticky: boolean };
export const defaultAutoRoutePolicy: AutoRoutePolicy = { light: "gpt-4o-mini", standard: "gpt-4o", advanced: "gpt-5.5", defaultTier: "standard", allowPlatform: true, sticky: true };
