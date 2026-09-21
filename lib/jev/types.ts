export const JEV_MODEL = "typesafe-ai/jev";

export type JevComplexity = "light" | "standard" | "advanced";
export type JevIntent = "chat" | "code" | "analysis" | "sensitive" | "media" | "other";
export type JevSecurityCategory = "credential" | "personal_data" | "internal_data";

export type WorkspaceJevSettings = {
  autoRoutingEnabled: boolean;
  securityAuditEnabled: boolean;
  routeConfig: AutoRouteConfig;
};

export type AutoRouteProfile = Partial<Record<JevComplexity, string>>;
export type AutoRouteConfig = {
  alias: string;
  profiles: Record<JevIntent, AutoRouteProfile>;
  fallback: { intent: JevIntent; complexity: JevComplexity };
};

export type JevRouteDecision = {
  intent: JevIntent;
  complexity: JevComplexity;
  confidence: number;
};

export type JevSecurityDecision = {
  categories: JevSecurityCategory[];
  severity: "none" | "low" | "high";
  confidence: number;
};

export type JevDecision = {
  status: "jev" | "unavailable";
  route: JevRouteDecision | null;
  security: JevSecurityDecision;
  requestId: string | null;
  quotaUnits: number;
  promptTokens: number;
};
