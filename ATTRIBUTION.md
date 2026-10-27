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

The machine-readable pins are in `sources.lock.json` and
`content/sources.lock.json`. Every generated pack also carries a `provenance`
object with its source id, repository, commit, path, license, authors, and the
transformations applied.

## Pinned sources

| Source                                                                                     | Author      | License    | Commit                                     |
| ------------------------------------------------------------------------------------------ | ----------- | ---------- | ------------------------------------------ |
| [Taste Skill](https://github.com/Leonxlnx/taste-skill)                                     | Leonxlnx    | MIT        | `12af471f627f866411b4bd785b19646d3672784c` |
| [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md)                        | VoltAgent   | MIT        | `3b605329240ce735b510037cca322f1831fdd7f8` |
| [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) | Vercel Labs | MIT        | `434b7f91364665f2f733b310ec54809bf8f37937` |
| [Microsoft Playwright CLI](https://github.com/microsoft/playwright-cli)                    | Microsoft   | Apache-2.0 | `b1a5903c5b633b8c9f843ad7b629c2a78437040c` |

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

Microsoft Playwright CLI and TastePro's original code and content are licensed
under the Apache License 2.0. The full text is in `LICENSE` and in
`content/sources/licenses/playwright-cli.txt`.

## Reporting an attribution problem

If you believe a source is missing, misattributed, or used outside its license,
open an issue with the source id and the affected content id. Do not remove the
provenance fields; they are how the project keeps the promise auditable.
