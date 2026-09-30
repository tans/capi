# Next interface restoration

Baseline: `8e1a5035`. The complete legacy page inventory is `web/migration.json`.
The baseline source can be inspected with `git show 8e1a5035:<path>`.

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
- Phases 3–5 remain active: channel restoration, complete billing ledger, public
  pages/docs, account/team/admin/security management and final fidelity audit.
