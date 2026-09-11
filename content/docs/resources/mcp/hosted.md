---
title: Hosted MCP
description: Connect remote MCP clients to Capi over OAuth without an API key.
---

Hosted MCP is a remote MCP server at `https://mcp.capi.ai/mcp`. The client authenticates through OAuth, so no key is created, stored, or shared.

## When to use it

Choose hosted when:

- The client supports remote MCP servers with OAuth (most current agents do).
- You do not want a long-lived API key on a laptop or in a shared config file.
- You want to review and revoke access from the dashboard rather than rotating keys.

Choose [local MCP](/docs/resources/mcp/local) when you need the server inside a private network, or when the client cannot do OAuth.

## Connect

Point the client at the endpoint and let it discover the rest:

```json
{
  "mcpServers": {
    "capi": {
      "type": "http",
      "url": "https://mcp.capi.ai/mcp"
    }
  }
}
```

On first use the client opens a browser. Sign in or create a Capi account, pick the Account to authorise, and approve. The client stores a refresh token; you never copy a secret.

## Discovery endpoints

Clients that implement the MCP authorization spec discover these automatically:

```http
GET https://capi.ai/.well-known/oauth-protected-resource
GET https://capi.ai/.well-known/oauth-authorization-server
```

Capi supports Dynamic Client Registration, authorization code with S256 PKCE, and rotating refresh tokens.

## Review and revoke

Open **Settings → Authorized apps** in the dashboard to see every connected client, when it was last used, and the scopes it holds. Revoking invalidates the refresh token immediately; the client has to re-authorise on its next call.

## Scopes

The OAuth consent screen requests scopes you select at approval time. Supported values mirror the Platform Management scope list:

- `video.generate`, `image.generate`, `music.generate`, `audio.generate`
- `llm.chat`, `llm.embed`
- `billing.read`

Grant the narrowest set that makes the agent useful. A marketing-content agent rarely needs `billing.read`.

## Troubleshooting

**The browser does not open.** Some headless environments cannot launch one. Copy the authorisation URL the client prints into any browser and paste the resulting code back.

**Repeated consent prompts.** The client is not persisting the refresh token. Check that its config directory is writable.

**`invalid_redirect_uri`.** The client registered a redirect URI it then changed. Re-register by removing and re-adding the server entry.

**Calls fail with `403` after approval.** The granted scopes do not cover the tool being called. Re-authorise and tick the extra scope.

## Next steps

- [MCP overview](/docs/resources/mcp) — tools and permissions.
- [Local MCP](/docs/resources/mcp/local) — key-based alternative.
