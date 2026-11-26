# Attribution

TastePro is an open-core project. The server code and the original TastePro
content are licensed under the Apache License 2.0. Upstream-derived content
remains under the license of its source. This file records the pinned sources,
what was used, and what TastePro changed.

The complete upstream license texts are committed at:

- `content/sources/licenses/taste-skill.txt`
- `content/sources/licenses/awesome-design-md.txt`
- `content/sources/licenses/web-interface-guidelines.txt`
- `content/sources/licenses/playwright-cli.txt`
- `content/sources/licenses/govuk-design-system.txt`
- `content/sources/licenses/uswds.txt`
- `content/sources/licenses/cms-design-system.txt`
- `content/sources/licenses/nhs-uk.txt`
- `content/sources/licenses/carbon.txt`
- `content/sources/licenses/spectrum.txt`
- `content/sources/licenses/ethereum-org.txt`
- `content/sources/licenses/pie.txt`
- `content/sources/licenses/sap.txt`

The machine-readable pins are in `sources.lock.json` and
`content/sources.lock.json`. Every generated pack also carries a `provenance`
object with its source id, repository, commit, path, license, authors, and the
transformations applied.

## Pinned sources

| Source                                                                                     | Author                | License    | Commit                                     |
| ------------------------------------------------------------------------------------------ | --------------------- | ---------- | ------------------------------------------ |
| [Taste Skill](https://github.com/Leonxlnx/taste-skill)                                     | Leonxlnx              | MIT        | `12af471f627f866411b4bd785b19646d3672784c` |
| [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md)                        | VoltAgent             | MIT        | `3b605329240ce735b510037cca322f1831fdd7f8` |
| [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) | Vercel Labs           | MIT        | `434b7f91364665f2f733b310ec54809bf8f37937` |
| [Microsoft Playwright CLI](https://github.com/microsoft/playwright-cli)                    | Microsoft             | Apache-2.0 | `b1a5903c5b633b8c9f843ad7b629c2a78437040c` |
| [GOV.UK Design System](https://github.com/alphagov/govuk-design-system)                    | GDS                   | OGL-3.0    | `0c6de5736a4e755a3808fb31d3a7723a33b7c705` |
| [USWDS](https://github.com/uswds/uswds-site)                                               | GSA                   | CC0-1.0    | `af13d80f071c3d897bee422f51954d9d7d156474` |
| [CMS Design System](https://github.com/CMSgov/design-system)                               | CMS                   | CC0-1.0    | `269a1abeb3159824800e134064db8a7b35821ccd` |
| [NHS.UK Design System](https://github.com/nhsuk/nhsuk-service-manual)                      | NHS England           | OGL-3.0    | `4a37578c4d8fa2c5bbf11b1039d806bebce59234` |
| [IBM Carbon](https://github.com/carbon-design-system/carbon-website)                       | IBM                   | Apache-2.0 | `5e9cd1da43c32d3d3b991dc947b427f674da61a8` |
| [Adobe Spectrum](https://github.com/adobe/spectrum-design-data)                            | Adobe                 | Apache-2.0 | `1818e9c1035fd38f361a0698fb3453477b702552` |
| [ethereum.org](https://github.com/ethereum/ethereum-org-website)                           | Ethereum Foundation   | CC-BY-4.0  | `4302e8c0a8e51d161c124e8c57d8d93da2995da1` |
| [PIE Design System](https://github.com/justeattakeaway/pie)                                | Just Eat Takeaway.com | Apache-2.0 | `cf7021732ad8ded4c818e95205d15b601d80fe50` |
| [SAP Fiori](https://github.com/SAP/fundamental-styles)                                     | SAP                   | Apache-2.0 | `0753390b563b4eafe4d90ec812205df1361941ac` |

## Taste Skill

**Used for:** design directions, palettes, type pairings, hero and section
blueprints, motion recipes, site studies, photo-set metadata, the app-screen
library, and reference essays.

**Paths:** `skills/taste-skill/SKILL.md`,
`skills/taste-skill/library/*.json`, and `skills/taste-skill/references/`.

**TastePro transformations:**

- Normalized upstream sector and app-kind vocabulary to the TastePro domain
  taxonomy.
- Derived compact summaries from longer upstream prose.
- Mapped palette and type records into stable `palette/*` and `type/*` ids.
- Added provenance, quality, domain, and tag metadata.
- Recomputed contrast checks for palettes.
- Kept reference essays as Markdown bodies under `content/references/`.

**Not included:** third-party screenshots, logos, or binary design assets.
Site studies are text analyses only.

## Awesome DESIGN.md

**Used for:** 84 brand design-system analyses with YAML design tokens.

**Paths:** `design-md/` in the upstream repository.

**TastePro transformations:**

- Parsed YAML frontmatter and design-token sections.
- Resolved token references such as `{colors.primary}`.
- Computed WCAG contrast checks for core token pairs.
- Inferred moods, domains, and summaries.
- Repaired invalid YAML/prose edge cases where necessary.
- Marked ten incomplete brands explicitly instead of inventing missing tokens.
- Added a `provenance` block and an attribution note to each brand pack.

**Not included:** brand logos, screenshots, fonts, or proprietary brand assets.
Brand names are used descriptively for reference analysis. Do not impersonate a
brand or reuse its identity.

## Vercel Web Interface Guidelines

**Used for:** the 104-rule web-interface audit rubric.

**Paths:** `command.md` and `AGENTS.md` in the upstream repository.

**TastePro transformations:**

- Parsed the Markdown rules into stable `guideline/*` ids.
- Extracted category, severity, tags, "instead" guidance, and source line
  numbers.
- Added source URLs and provenance.
- Added category/severity filtering, JSON cards, and Markdown checklists.

The rules remain Vercel Labs' content. Cite the guideline id and source line
when you use a rule in a report.

## Microsoft Playwright CLI

**Used for:** browser automation and session-management guidance for the
planned audit loop, plus reference skill documents.

**Paths:** `README.md`, `skills/playwright-cli/SKILL.md`, and
`skills/playwright-cli/references/`.

**TastePro transformations:**

- Kept the upstream guidance as reference documents with provenance.
- Normalized headings and summaries for the catalog.
- Did not vendor or modify Playwright itself.

The TastePro audit implementation is original. M0 ships the audit rubric and
prompt; it does not execute a browser. Browser execution is a later milestone.

## GOV.UK Design System

**Used for:** eight form and service patterns — bank details, payment card
details, validation, error summary, addresses, names, dates, and check answers.

**Paths:** `src/patterns/*/index.md` and `src/components/error-summary/index.md`
in the pinned repository.

**License:** repository code is MIT; the published guidance is licensed under
the Open Government Licence v3.0.

**TastePro transformations:**

- Converted the published Markdown into `app-pattern` packs.
- Stripped Nunjucks examples, links, and image references from the guidance.
- Mapped each pattern to the TastePro domain taxonomy and form kinds.
- Added provenance, source URLs, and quality metadata.
- Did not copy Crown marks, screenshots, or example markup.

**Not included:** the GOV.UK crown, Royal Coat of Arms, screenshots, card-scheme
marks, or any binary asset.

## USWDS

**Used for:** eight identity and complex-form patterns — name, address, date of
birth, email address, phone number, Social Security Number, keep a record, and
establish trust.

**Paths:** `pages/patterns/create-a-profile/*.md` and
`pages/patterns/complex-form/*.md` in the pinned repository.

**License:** CC0 1.0 Universal (public domain).

**TastePro transformations:**

- Converted the HTML guidance blocks into `app-pattern` packs.
- Removed Jekyll includes, previews, code samples, and example markup.
- Mapped each pattern to the TastePro domain taxonomy and form kinds.
- Added provenance, source URLs, and quality metadata.

**Not included:** agency logos, third-party fonts and icons, screenshots, or
example markup.

## CMS Design System

**Used for:** eight Medicare/Medicaid component and pattern pages — alert,
table, accordion, pagination, tabs, multi-input date field, ZIP codes, and
phone numbers.

**Paths:** `packages/docs/content/components/**/*.mdx` and
`packages/docs/content/patterns/*.mdx` in the pinned repository.

**License:** CC0 1.0 Universal for the project, with third-party fonts and
icons under their own licenses.

**TastePro transformations:**

- Kept the guidance section and removed MDX imports, examples, and JSX wrappers.
- Converted the remaining guidance into `app-pattern` packs.
- Mapped each pattern to the TastePro domain taxonomy and form kinds.
- Added provenance, source URLs, and quality metadata.

**Not included:** fonts, icons, agency logos, screenshots, or example markup.

## NHS.UK Design System

**Used for:** eight healthcare service patterns — NHS numbers, check answers,
confirmation pages, question pages, start pages, complete multiple tasks,
help users decide when and where to get care, and interruption pages.

**Paths:** `app/views/design-system/patterns/*/index.njk` in the pinned
repository.

**License:** repository code is MIT; the published guidance is licensed under
the Open Government Licence v3.0.

**TastePro transformations:**

- Removed Nunjucks template tags, macros, and design examples.
- Converted the guidance HTML to `app-pattern` packs.
- Mapped each pattern to the TastePro domain taxonomy and form kinds.
- Added provenance, source URLs, and quality metadata.

**Not included:** NHS marks, Frutiger, images, screenshots, or example markup.

## IBM Carbon

**Used for:** ten component usage pages, eight interface patterns, and five
data-visualization guides — tabs, dropdown, data table, modal, form,
notification, search, button, checkbox, text input; empty states, loading,
forms, notifications, filtering, status indicators, search, dialog; chart
anatomy, color palettes, dashboards, axes and labels, legends.

**Paths:** `src/pages/components/*/usage.mdx`,
`src/pages/patterns/*/index.mdx`, and
`src/pages/data-visualization/*/index.mdx` in the pinned repository.

**License:** Apache-2.0.

**TastePro transformations:**

- Removed MDX imports, Storybook demos, layout wrappers, and images.
- Converted the remaining guidance to `app-pattern` packs.
- Mapped each page to the TastePro domain taxonomy and component kinds.
- Added provenance, source URLs, and quality metadata.
- Marked the snapshot as archived: the docs repository was archived on
  2026-09-30.

**Not included:** IBM marks, screenshots, images, or example markup.

## Adobe Spectrum

**Used for:** nine components (button, card, table, tabs, toast, text field,
checkbox, menu, tooltip) and five foundations (attention hierarchy, colors,
type system, component spacing, cognitive load).

**Paths:** `packages/design-data/components/*.json` and
`packages/design-data/guidelines/*.json` in the pinned repository.

**License:** Apache-2.0. The data schema is `1.0.0-draft`; the pinned snapshot
is validated at ingest.

**TastePro transformations:**

- Flattened `documentBlocks` into guidance text.
- Dropped embedded images, fonts, and token references.
- Mapped each entry to the TastePro domain taxonomy.
- Added provenance, source URLs, and quality metadata.

**Not included:** Adobe marks, fonts, images, or screenshots.

## ethereum.org

**Used for:** Web3 design overview, seven usability heuristics, DEX design
guidance, transaction lifecycle, and gas/fee explanation.

**Paths:** `public/content/developers/docs/design-and-ux/**/*.md` and the
transactions and gas documentation pages in the pinned repository.

**License:** CC BY 4.0 for content; MIT for repository code.

**TastePro transformations:**

- Removed images and outbound link markup.
- Converted the remaining Markdown to `app-pattern` packs.
- Mapped each page to the crypto-web3 domain and Web3 kinds.
- Added provenance, source URLs, and quality metadata.

**Not included:** third-party images, outbound research, Ethereum marks, or
screenshots.

## PIE Design System

**Used for:** eight food-delivery and marketplace patterns — onboarding and
guided tour, overlays, forms, messaging and chatbots, JET AI, Just Eat Plus,
cookie banner, and haptic feedback.

**Paths:** `apps/pie-docs/src/patterns/*/{overview,guidance,web-guidance,apps-guidance}/*.md`
in the pinned repository.

**License:** Apache-2.0.

**TastePro transformations:**

- Removed Nunjucks includes, images, and link markup.
- Joined overview and platform guidance into one pack per pattern.
- Mapped each pattern to food-delivery, marketplace, and commerce domains.
- Added provenance, source URLs, and quality metadata.

**Not included:** the JET brand palette, logos, food photography, or fonts.

## SAP Fiori

**Used for:** twenty enterprise components — button, table, form group, input,
select, popover, message box, card, tab bar, breadcrumb, pagination, list, menu,
toolbar, wizard, date picker, checkbox, radio, switch, and notification.

**Paths:** `docs/component-guidance.json` in the pinned repository.

**License:** Apache-2.0.

**TastePro transformations:**

- Selected `description`, `whenToUse`, `whenToAvoid`, and `bestPractices`.
- Dropped implementation, token, and API fields.
- Mapped each component to enterprise, analytics, manufacturing, logistics, and
  fintech domains.
- Added provenance, source URLs, and quality metadata.

**Not included:** SAP marks, images, or implementation code.

## Original TastePro content

The following are original to TastePro and licensed under Apache-2.0:

- The 40-domain taxonomy in `content/taxonomy/domains.json`.
- The 15 seed domain playbooks in `content/domains/seed.json`.
- The catalog/search/get/guidelines implementation and server transports.
- The skill guide, prompts, validation scripts, and tests.
- Any future original templates and audit tooling.

Original packs use `provenance.source: "tastepro"` and
`provenance.commit: "workspace"`.

## MIT license text

The three MIT-licensed sources are reproduced under the following copyright
notices and the standard MIT terms.

```text
Copyright (c) 2026 Leonxlnx
Copyright (c) 2026 VoltAgent
Copyright (c) 2025 Vercel Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Apache-2.0

Microsoft Playwright CLI, IBM Carbon, Adobe Spectrum, PIE, SAP Fiori, and
TastePro's original code and content are licensed under the Apache License 2.0.
The full texts are in `LICENSE`, `content/sources/licenses/playwright-cli.txt`,
`content/sources/licenses/carbon.txt`,
`content/sources/licenses/spectrum.txt`,
`content/sources/licenses/pie.txt`, and
`content/sources/licenses/sap.txt`.

## Open Government Licence v3.0

The GOV.UK Design System guidance is used under the Open Government Licence
v3.0:

> Contains public sector information licensed under the Open Government Licence
> v3.0.

The full licence texts are committed at
`content/sources/licenses/govuk-design-system.txt` and
`content/sources/licenses/nhs-uk.txt`, and published at
https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/.

## CC0 1.0

USWDS and the CMS Design System are released under CC0 1.0 Universal (public
domain). The full texts are committed at
`content/sources/licenses/uswds.txt` and
`content/sources/licenses/cms-design-system.txt`.

## CC BY 4.0

The ethereum.org guidance is used under the Creative Commons Attribution 4.0
International licence. Changes: images and link markup removed, pages
normalized into app-pattern packs. The full licence text is committed at
`content/sources/licenses/ethereum-org.txt`.

## Reporting an attribution problem

If you believe a source is missing, misattributed, or used outside its license,
open an issue with the source id and the affected content id. Do not remove the
provenance fields; they are how the project keeps the promise auditable.
