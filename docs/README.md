# Documentation index

This directory contains internal engineering and product documents. The user-facing guides and integration resources live in [`content/docs/`](../content/docs/) and are published under `/docs`.

## Internal documents

| Document | Purpose and status | Scope |
| --- | --- | --- |
| [Development contract](./DEVELOPMENT-CONTRACT.md) | Active collaboration and consistency rules | Documentation ownership, change workflow, and review expectations |
| [JEV routing and security architecture](./architecture/JEV-ROUTING-SECURITY.md) | First-version architecture design; compare it with current code before treating design details as implemented behavior | Intended JEV boundaries and design decisions, subject to implementation verification |
| [Storage architecture](./storage-architecture.md) | Current storage boundaries and future driver guidance | Storage abstractions and database responsibilities; verify implementation details against `lib/storage/` |
| [Image protocol configuration](./IMAGE-PROTOCOL-CONFIG.md) | Operator guide for image protocol adapter configuration | Configuration shape and examples; implementation remains authoritative for runtime behavior |
| [Video protocol configuration](./VIDEO-PROTOCOL-CONFIG.md) | Operator guide for video protocol adapter configuration | Configuration shape and examples; implementation remains authoritative for runtime behavior |
| [Product research notes](./PRODUCT-RESEARCH-NOTES.md) | Open research topics, not delivery commitments | Questions to resolve before proposing product work |

## Where facts are authoritative

| Fact | Authoritative source | Documentation role |
| --- | --- | --- |
| Runtime behavior, access control, and validation | Server code and data model | Describe verified behavior; flag proposals and assumptions explicitly |
| HTTP endpoint schema and generated API reference | `lib/api-spec.ts` together with `app/api/**` | Explain usage without defining a competing schema |
| Public guide/resource membership and labels | `lib/docs-nav.ts` | Every listed slug must resolve to a Markdown file under `content/docs/` |
| Model identifiers, capabilities, and catalog metadata | `lib/models-data.ts` and `lib/models-i18n.ts` | Link readers to the catalog; avoid maintaining another model list |
| Database schema and initialization | `lib/relay/store.ts` and related storage modules | Explain storage choices; do not create a second schema definition |
| Collaboration requirements | `AGENTS.md` | This index and the development contract organize those requirements without overriding them |

When sources disagree, verify actual server behavior and resolve the conflict at the authoritative source. Update affected documentation and navigation in the same change. A design document or example is not evidence that a feature is implemented.

## Keep documentation consistent

When changing a feature, use this sequence:

1. Identify the authoritative code/data source for the fact being changed.
2. Update the source and its relevant API reference, guide, or operator document in the same change.
3. If a public Markdown file is added, removed, or renamed, update `lib/docs-nav.ts` in the same change. Keep navigation labels and Markdown frontmatter titles consistent; a section may make the navigation label shorter.
4. Update README links only for stable project entry points. Use this index instead of keeping a second inventory of individual documents in README.
5. Search for old names, paths, field names, and copied claims across code and documentation; correct every affected reference.
6. Review the diff to confirm local Markdown links resolve and that examples agree with the implementation.

Keep one complete definition of each fact. Other documents should give context and link to that definition. Mark content as a proposal, design, or verified behavior so readers can tell its status; remove or refresh stale status dates when the underlying decision changes.

## Public documentation groups

`lib/docs-nav.ts` is the exact inventory for pages shown in the documentation overview and sidebar. Current source files are grouped as follows:

- Guides: `guides/quickstart.md`, `guides/authentication.md`, `guides/task-api/quickstart.md`, and `guides/llm-api/quickstart.md`.
- Resources: `resources/files.md`, the tool integrations in `resources/tool-integrations/`, and the application guides in `resources/application-practices/`.
- API reference: defined separately in `lib/api-spec.ts`; it is rendered under `/docs/api` and is not authored as Markdown in `content/docs/`.
