# Next interface restoration

Baseline: `8e1a5035`. The complete legacy page inventory is `web/migration.json`.
The baseline source can be inspected with `git show 8e1a5035:<path>`.

## Agreed architecture and migration method

Runtime remains a single Go binary. Node is allowed only in the build pipeline:
the preserved React components and styles build with Vite, and Go embeds the
result with `go:embed`. Go serves static assets, locale/deep-link routes and all
authenticated APIs. No Next or Node process is required in deployment.

Use the Next source as the authority for page composition and interaction, not
just screenshots: preserve navigation, provider selection, drawers/dialogs,
validation, loading/empty/error states, copy feedback and keyboard behavior.
Next server actions, database imports and server-only loaders move behind Go
APIs; a frontend adapter preserves the component contracts. Opaque IDs,
timestamps, money, pagination, permissions and errors need explicit contracts.

Restore one complete user flow at a time. Compare the original page and states,
implement missing Go behavior, connect the preserved component, verify actual
mutations and persistence, then record evidence in the inventory and commit.
New Go features such as native protocols and Codex channels follow the existing
design system while retaining their backend capabilities.

Public pages require an SEO decision before release: prerender stable marketing
and documentation content during the Node build, and provide indexable metadata
for model pages from authoritative model data. A client-only route shell is not
sufficient evidence of public-page parity.

Release keeps `/legacy` as a temporary UI fallback. Database migrations are
additive and preserve archived legacy tables; take a backup before production
migration. UI fallback does not reverse a database migration. Verify any binary
downgrade against the migrated schema before using it as rollback.

## Delivery and evidence

1. Baseline/build: preserve original components and tokens; reproducible locked
   Node build; compiled assets embedded in Go; deep links; legacy console fallback.
2. Application shell: auth, authenticated redirects/return path, localization,
   navigation, workspace switcher, account menu and responsive layouts.
3. Core operations: key create/edit/rotate/revoke, channel create/edit/status/
   discovery, model access, overview, filtered usage and billing. Every operation
   must use real Go APIs and enforce workspace permissions.
4. Public surfaces: home, models/details, documentation/navigation/TOC/copy,
   pricing, teams, skills, contact and legal pages. Content must match Go features.
5. Full management: files, user settings/password/recovery, workspace creation,
   invitations/members/roles, admin users/groups/prices/redemption/settings,
   budget/group enforcement, workspace routing/security, new native/Codex APIs.

For each step record code, tests and runtime evidence before marking complete.
Pending screens are temporary and are not acceptance evidence. No phase is
complete merely because its routes or components exist.

## Compatibility contract

- IDs are opaque strings, including legacy numeric strings; do not parse to Number.
- Adapt legacy camelCase/status fields at the API boundary; Go is authoritative.
- Money uses integer USD micros; legacy quota conversion is explicit.
- Existing Go `/v1` protocols and behavior must remain covered by gateway tests.
- Unsupported channel fields require backend implementation; never silently drop.
- Role checks apply to reads and mutations; frontend visibility is not authorization.
- Public model metadata is separate from actual workspace model availability.
- Build in Node, embed in Go, deploy the Go binary. `/legacy` is a fallback while
  migration is active. Database changes are additive with backup/compatibility checks.

## Verification gates

Frontend typecheck and production build; Go tests and vet; meaningful control-plane
integration tests; gateway smoke; desktop/mobile browser review in both languages;
deep-link refresh/back/forward; actual core and team/admin user flows; final
page-by-page and API-by-API inventory audit. Each completed change is committed.

## Current evidence

- Build baseline committed as `2c3c3e73`; original Go console remains at `/legacy`.
- Production frontend build, Go tests and vet pass. Embedded asset/deep-link tests
  verify API/asset 404 boundaries, cache rules and HEAD handling.
- Browser verified Chinese registration/login, dashboard navigation with opaque
  workspace IDs, overview and real key creation. New secret dialogs survive API
  revalidation; native dialogs keep keyboard focus within the task.
- Browser also verified native-dialog Escape dismissal and the 390px mobile key
  page: no document overflow, compact navigation, scrollable key table.
- Control-plane integration tests cover key edit/rotation/revocation, exact decimal
  budgets, exhausted-key rejection, cross-workspace/member permissions, paginated
  usage with independent totals and transactional workspace creation.
- Channel editor reuses the original provider picker, tabbed sheet and form. Go
  executes model mappings, key selection, custom headers/parameters, group filters,
  automatic disable, image/video declarative adapters and TypeSafe evaluation.
- Integration tests verify actual upstream payloads/auth, image output normalization,
  multipart file integrity, disable configuration and video polling after channel
  deletion using a credential/endpoint snapshot.
- Browser verified model discovery against a local mock upstream, create/edit/status
  changes and persisted deep-link refresh. Desktop/mobile sheet inspection found no
  document overflow at 390px; keyboard focus remains in the sheet.
- Billing and admin redemption now use the preserved forms and table composition.
  Real APIs expose available/balance/reserved credit, paginated ledger, redemption
  destination/time and code creation; the admin API also supports disabling unused
  codes. Workspace members can read
  billing; only owners/admins redeem credit. Admin issuance remains admin-only.
- Relay billing reserves credit before upstream calls and settles usage, wallet,
  ledger and reservation in one transaction. BYOK remains free. Concurrent budget
  checks, retries, canceled clients, duplicate redemption, injected write failure,
  expired holds and overflow are tested. Stream completion follows settlement;
  failure emits a stream error and leaves visible unresolved reconciliation state.
- Legacy wallet entries and redeemed/unused codes are restored idempotently from
  archived tables. Channel token rates and administrator model/cache/per-call/
  video pricing plus group multipliers are enforced. System exchange-rate and
  display-currency administration remain pending.
- Browser verified admin creation → workspace redemption → updated balance/ledger;
  duplicate redemption and reload preserve balance. Final English 390px billing
  review has no document overflow; Chinese desktop admin shows the real redeemed
  destination/time. Production frontend build, full Go tests/vet, focused billing
  race tests and live authentication/workspace smoke pass.
- Admin groups now use the preserved Next `AdminConsole` composition, including
  group dialogs, status actions, derived model/channel counts and route inspection.
  Go endpoints provide admin-only safe channel listings and group/model abilities;
  test coverage checks denied member access, hidden channel credentials and route
  inspection. A live Chinese browser run created a group, confirmed it survives a
  deep-link reload, and inspected a configured model's priority/weight/share;
  the 390px mobile viewport has no horizontal overflow.
- Admin channels now route to the preserved `AdminConsole` editor and table.
  Go supports model discovery and full channel CRUD for platform and workspace
  channels, while keeping credentials out of list responses. Integration tests
  cover administrator checks, cross-origin write rejection and status persistence.
- Admin model pricing now uses the preserved `AdminTools` editor and a persisted
  Go pricing contract. Token, cached-token, per-call and video-per-second prices
  validate before saving; rates are stored as integer USD micros and snapshotted
  at request start so an in-flight charge does not change when an administrator
  edits prices. Settlement tests cover token, per-call and video charging. A live
  Chinese browser session saved pricing, refreshed the deep link to confirm it
  persisted, and verified the pricing table scrolls within a 390px viewport.
  Group multipliers are applied to credit reservation and final settlement.
- Phases 3–5 remain active: public marketing/legal surfaces, remaining account,
  team/admin/security management, recovery/media retention, and final fidelity
  audit.
- Documentation routes now restore guide/resource overviews, original three-column
  reading layouts and split API-reference composition. Search, locale-preserving
  links, prev/next, TOC, highlighted code tabs, copy feedback and Markdown exports
  work. Failed clipboard writes offer manual-copy recovery.
- Node prerenders 58 localized documentation pages and 52 Markdown exports, then
  embeds them in Go. Every prerendered page is tested for body/metadata, legacy API
  paths and heading anchors; Markdown content type, HEAD, unknown-route 404 and
  docs-index redirect are covered. The docs module loads separately from console.
- Browser verified desktop search/copy/Markdown/history/title/canonical updates and
  mobile directory search, Python code tab and Chinese copied feedback. The API
  layout now fits 390px without document overflow; full Go tests/vet pass.
- Core docs describe current Go behavior rather than advertise unimplemented Next
  backend contracts. Newly identified compatibility work remains in scope: video
  submission idempotency/reservation, generated-media archives, file references and
  signed downloads. New native-protocol reference coverage and current third-party
  integration configuration review are still pending before final docs sign-off.
