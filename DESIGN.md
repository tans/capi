# CAPI console visual baseline

Restore the interface from Git commit `8e1a5035`. This is a preservation project.
The authority is `app/globals.css`, the marketing/auth/app layouts, and the
React components at that commit, copied into `web/src`.

- White surfaces, fine neutral borders, compact tables, near-black regular
  actions, blue emphasis, Geist sans/mono typography and the original spacing.
- Retain the dashboard top bar, workspace switcher, account menu, desktop side
  navigation and compact mobile navigation.
- Retain channel provider selection and the right-hand editor with connection,
  routing and advanced tabs; retain key forms, feedback and copy interactions.
- Restore English and Chinese dictionaries and locale routes.
- Load, empty, validation, failure, retry, busy and permission states use real
  Go API responses. Do not show working-looking controls that discard settings.
- Runtime is one Go binary. Node is only a build dependency. No CDN runtime
  scripts, credentials or server database code belong in the frontend bundle.

Console mode: Operate. Documentation mode: Read. Marketing mode: Persuade.
Existing copy must be checked against current gateway behavior before release.
