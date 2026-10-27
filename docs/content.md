# Content model and authoring

TastePro's content is a curated, versioned catalog. The server never writes
content at runtime; it reads validated JSON and Markdown from the content
directory. This document explains the model, the generated/authored split, and
how to add or change content without breaking provenance or the content hash.

## Principles

1. **One pack, one idea.** A direction is a complete visual argument; a section
   is one blueprint; a guideline is one testable rule.
2. **Provenance is mandatory.** Every pack records source, repository, commit,
   path, license, authors, and transformations.
3. **Quality is a promise.** Do not label a pack `verified` unless it has been
   checked against its source or passed the original-content audit.
4. **No brand impersonation.** Brand packs are text analyses of published design
   systems. They are not templates to clone, and they carry no logos,
   screenshots, or proprietary assets.
5. **Generated files are not hand-edited.** Change the source or the transformer,
   run `npm run ingest`, then validate.
6. **Content must work offline.** Generated output is committed.

## Directory layout

```text
content/
├── LICENSE                     # content licensing summary
├── sources.lock.json           # pins used by the last ingest
├── taxonomy/
│   └── domains.json            # 40-domain taxonomy (authored)
├── domains/
│   └── seed.json               # authored domain playbooks (authored)
├── generated/
│   ├── catalog.json            # compact search/browse cards
│   ├── stats.json              # counts, quality mix, content hash, warnings
│   ├── sources.json            # source pins and per-source counts
│   └── kinds/
│       ├── directions.json
│       ├── palettes.json
│       ├── types.json
│       ├── heroes.json
│       ├── sections.json
│       ├── motions.json
│       ├── sites.json
│       ├── brands.json
│       ├── guidelines.json
│       ├── references.json
│       ├── domains.json
│       ├── app-styles.json
│       ├── app-shells.json
│       └── app-patterns.json
├── references/
│   ├── taste-skill/*.md        # reference essays
│   ├── playwright-cli/*.md     # browser/session guidance
│   └── web-interface-guidelines/agents.md
└── sources/
    └── licenses/*.txt          # full upstream license texts
```

`sources.lock.json` at the repository root is the human-edited pin file.
`content/sources.lock.json` is written by ingest and records the same pins plus
metadata used by the generated content.

## Content kinds

| Kind          | File                | What it contains                                                                     |
| ------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `domain`      | `domains.json`      | Taxonomy entry plus optional playbook                                                |
| `direction`   | `directions.json`   | Complete visual argument: idea, composition, type, colour, imagery, motion, pitfalls |
| `palette`     | `palettes.json`     | Background/surface/ink/muted/accent tokens, fields, contrast checks                  |
| `type`        | `types.json`        | Display/text pairing, sources, weights, CSS, scale                                   |
| `hero`        | `heroes.json`       | Hero archetype, blueprint, mobile behavior, motion                                   |
| `section`     | `sections.json`     | Section role, shape, blueprint, mobile behavior                                      |
| `motion`      | `motions.json`      | Motion recipe and description                                                        |
| `site`        | `sites.json`        | Text study of a real site: idea, sections, lessons                                   |
| `brand`       | `brands.json`       | Design-token analysis of a published brand system                                    |
| `guideline`   | `guidelines.json`   | One audit rule with category, severity, `instead`, source line                       |
| `reference`   | `references.json`   | Reference document metadata plus body path                                           |
| `app-style`   | `app-styles.json`   | App visual system                                                                    |
| `app-shell`   | `app-shells.json`   | App shell/navigation blueprint                                                       |
| `app-pattern` | `app-patterns.json` | App screen pattern                                                                   |

All packs share the base fields:

```json
{
  "id": "direction/name-as-monument",
  "kind": "direction",
  "name": "Name as monument",
  "summary": "One-sentence decision-oriented summary.",
  "domains": ["portfolios"],
  "sectors": [],
  "tags": ["editorial", "oversized-type"],
  "moods": ["quiet", "confident"],
  "quality": "verified",
  "provenance": {
    "source": "taste-skill",
    "repo": "https://github.com/Leonxlnx/taste-skill",
    "commit": "12af471f627f866411b4bd785b19646d3672784c",
    "path": "skills/taste-skill/library/directions.json",
    "license": "MIT",
    "authors": ["Leonxlnx"],
    "url": "",
    "transformations": ["mapped sectors to TastePro domains", "derived summary"]
  },
  "sourceUrl": "https://github.com/Leonxlnx/taste-skill/blob/12af.../skills/taste-skill/library/directions.json"
}
```

Kind-specific fields are defined in `src/core/schema.ts`. Unknown fields are
preserved by the schemas, but tools only project known fields.

## IDs

Ids are stable and human-readable:

```text
<kind>/<slug>
```

Examples: `domain/fintech-payments`, `direction/quiet-instrument`,
`palette/white-navy-tab`, `brand/stripe`, `guideline/focus-visible-ring`.

Rules:

- The first segment must equal the pack's `kind`.
- Slugs are lowercase, ASCII, hyphen-separated.
- Ids are never reused for a different idea. If an idea changes materially, give
  it a new id and leave the old one deprecated.
- `taste_get` accepts a bare suffix (`stripe`, `fintech-payments`) only when it
  resolves to exactly one catalog entry.

## Domains

There are two layers:

### Taxonomy (`content/taxonomy/domains.json`)

The 40-domain map. Each entry has:

```json
{
  "id": "fintech-payments",
  "name": "Fintech and payments",
  "family": "software",
  "description": "Banking, payments, lending, insurance, and financial infrastructure.",
  "aliases": ["fintech", "payments", "banking", "lending", "insurance"],
  "launchTier": true,
  "status": "available",
  "depth": "seed",
  "upstreamSectors": ["fintech"],
  "appKinds": ["finance"],
  "brandCategories": ["Fintech & Crypto"],
  "questions": ["..."]
}
```

- `family` groups domains for fallback: `software`, `product`, `commerce`,
  `creative`, `services`, `society`, `science`.
- `launchTier` marks the 15 domains with authored playbooks.
- `depth` is `taxonomy`, `seed`, or `playbook`.
- `status` is `available` or `planned`.
- `aliases` drive query-to-domain inference. Prefer multi-word aliases for
  ambiguous terms; single-word aliases are weak signals.
- `upstreamSectors`, `appKinds`, and `brandCategories` map upstream vocabulary
  into the domain. They are not shown as public taxonomy.

### Playbooks (`content/domains/seed.json`)

A playbook is keyed by domain id and contains:

```json
{
  "fintech-payments": {
    "audience": ["..."],
    "jobs": ["..."],
    "trust": ["..."],
    "informationArchitecture": ["intro", "proof", "..."],
    "conversion": "The primary action and why it fits the domain.",
    "contentChecklist": ["..."],
    "antiPatterns": ["..."],
    "signatureMoves": ["..."],
    "recommendedDirections": ["quiet-instrument"],
    "recommendedSections": ["pricing-tiers"],
    "recommendedPalettes": ["white-navy-tab"],
    "questions": ["..."],
    "liveThing": "The one thing the page must show that is real.",
    "notes": "Optional author notes."
  }
}
```

Recommended direction/palette/section ids must exist. Validation checks this.
Playbooks should answer domain-specific questions, not restate generic landing
page advice. The `liveThing` is the concrete proof the page must contain.

### Adding a playbook

1. Add or edit the domain in `content/taxonomy/domains.json`. Keep the id stable.
2. Add the playbook object under the same id in `content/domains/seed.json`.
3. Set `launchTier` to `true` only if the playbook is complete.
4. Run `npm run ingest`.
5. Run `npm run validate`. Fix unknown recommendations or empty sections.
6. Add or update a unit/integration test if the behavior is user-visible.
7. Run the full suite.

If a domain has no playbook, it is still searchable as a taxonomy-only pack with
`quality: "reference"` and `depth: "taxonomy"`. Tools label it as taxonomy-only.

### Family fallback

A taxonomy-only domain still has questions and mappings, but no deep playbook.
When a natural-language query maps exclusively to uncovered domains, search adds
complete playbooks from the same family and reports their ids in
`familyFallback`. `taste_get` on the taxonomy-only domain returns the same list
as `familyFallback.playbooks`, plus a note that these are family references, not
domain-specific playbooks.

Rules for fallback:

- Fallback only applies when **none** of the inferred domains has a playbook. A
  query such as `fintech dashboard` uses the fintech playbook and does not add
  software-family noise.
- An explicit `domain` filter stays literal; it does not pull in siblings.
- If the family has no playbook (the `science` family in M0), the response says
  so and returns the domain questions. Do not invent a family playbook.
- Never present a family playbook as if it were authored for the specific
  domain. Say "same-family fallback" and adapt with the domain questions.

The `questions` field on the domain pack is the authored set of questions from
the taxonomy. It is available even when no playbook exists.

## Quality

| Quality      | Meaning                                                                                       | Served by default |
| ------------ | --------------------------------------------------------------------------------------------- | ----------------- |
| `verified`   | Pinned upstream content plus automated validation, or an original asset that passed its audit | Yes               |
| `reviewed`   | A human reviewed the pack against its source                                                  | Yes               |
| `reference`  | Useful upstream reference data, not independently audited                                     | Yes               |
| `draft`      | Not ready to serve                                                                            | No                |
| `incomplete` | Missing required material; kept for inspection                                                | No                |

Incomplete brand packs must explain why in `incompleteReasons` and must not
invent missing tokens. Search excludes `incomplete` and `draft` unless the caller
passes `includeIncomplete`.

## Provenance

Upstream packs use the pinned source metadata. Original packs use:

```json
{
  "source": "tastepro",
  "repo": "",
  "commit": "workspace",
  "path": "content/taxonomy/domains.json",
  "license": "Apache-2.0",
  "authors": ["TastePro"],
  "url": "",
  "transformations": ["curated taxonomy"]
}
```

Validation enforces:

- upstream commits are 40-character lowercase hex;
- upstream repos are GitHub URLs;
- original content uses `source: "tastepro"` and `commit: "workspace"`;
- license, path, and authors are present;
- source ids are known.

Do not remove or rewrite provenance to make a pack look original. If a pack is
derived from multiple sources, record the primary source and describe the
combination in `transformations`; do not hide it.

## Generated vs authored

Authored:

- `content/taxonomy/domains.json`
- `content/domains/seed.json`
- `sources.lock.json`
- `content/references/` (committed copies of upstream reference documents)
- `content/sources/licenses/` (committed license texts)

Generated by `npm run ingest`:

- `content/generated/catalog.json`
- `content/generated/kinds/*.json`
- `content/generated/stats.json`
- `content/generated/sources.json`
- `content/sources.lock.json`

Do not hand-edit generated files. If a generated pack is wrong, fix the parser
or the authored source, then regenerate. Review the diff before committing; a
large diff may mean an upstream pin moved or a parser changed.

## Ingest pipeline

```bash
npm run ingest            # fetch missing sources, transform, write generated content
npm run ingest -- --refresh   # ignore the cache and re-fetch everything
npm run ingest:offline    # use .cache/sources only; fail if something is missing
npm run sources:update    # check the four pins for newer commits
npm run sources:update -- --write  # advance the pins (review the diff)
```

The cache is `.cache/sources/<source-id>/<path>`. It is gitignored. Ingest uses
retries, timeouts, and a concurrency limit. It fetches raw GitHub files at the
pinned commit, never the default branch.

Ingest writes:

- one JSON file per kind, sorted by name;
- the compact catalog, sorted by kind priority then name;
- source metadata with per-source counts;
- stats with counts, quality mix, warnings, and the content hash;
- reference Markdown bodies;
- upstream license texts.

Warnings are non-fatal content issues, such as an upstream contrast pair below
AA. They are recorded in `stats.json` and surfaced by `info` and `/healthz`.
Errors fail the ingest.

## Validation

`npm run validate` checks:

- every catalog entry parses and ids are unique;
- catalog counts match stats and the expected counts;
- the content hash recomputes;
- each kind file contains only its kind and every pack parses;
- provenance fields and source pins are valid;
- every reference body exists, stays inside the content directory, and is
  non-empty;
- every domain has aliases/family; launch-tier domains have playbooks;
- every playbook has non-empty sections, a real `liveThing`, and known
  recommended direction/palette/section ids;
- every guideline has a category, severity, source path, and positive line;
- brands marked complete have colors, typography, rounded, spacing, and
  component tokens; incomplete brands explain why;
- license files exist for all four upstream sources.

The validator exits non-zero on any error. Warnings do not fail the build.

## Reference documents

Reference packs store metadata in `references.json` and the body in
`content/references/<source>/<slug>.md`. `bodyPath` is relative to the content
directory. The loader rejects paths that escape it.

`taste_get` returns a 1,200-character excerpt by default. `includeBody: true`
returns the full body and raises the default budget to 24,000 tokens. Bodies are
validated at ingest and read time.

## Guidelines

Each rule has:

- `text` — the imperative rule;
- `category` — one of 17 categories;
- `severity` — `error`, `warn`, or `info`;
- `instead` — the preferred alternative, when the source gives one;
- `tags` — search vocabulary;
- `sourcePath` and `line` — where the rule came from.

Rules are parsed from the pinned Vercel Web Interface Guidelines. Do not
paraphrase a rule in a way that changes its meaning. If you add a TastePro-only
rule, give it `provenance.source: "tastepro"` and a clear path; do not attribute
it to Vercel.

## Brand packs

Brand packs are analyses, not clones. Rules:

- Use only published design tokens and prose from the pinned source.
- Do not bundle logos, screenshots, fonts, or proprietary assets.
- Do not reproduce large passages of brand copy.
- Mark incomplete packs rather than guessing missing values.
- Keep the anti-impersonation note in Markdown output.
- Compute contrast checks from resolved tokens; do not hand-wave accessibility.

If a brand asks to be removed, remove the pack, the catalog entry, and any
reference to it, then regenerate and validate. Record the removal in the commit
message.

## Templates (M1)

The six original templates are not part of M0. When they land:

- each template gets a `template/<slug>` id and a full spec;
- templates must be original, not traced from a brand or site;
- each template needs a screenshot or live preview generated by us, not a
  third-party asset;
- templates must declare their domain, direction, palette, type, sections, and
  responsive behavior;
- templates must pass the same provenance and validation rules.

Do not add a template by copying a site study or brand pack.

## Writing style

- Lead with the decision, not the mood board.
- Prefer concrete nouns and verbs over adjectives.
- One sentence per idea in list fields.
- Summaries are one sentence, under ~220 characters.
- Avoid "modern", "clean", "beautiful", "seamless" unless you define what they
  mean here.
- Name the tradeoff. A direction that works for everyone works for no one.
- Do not claim a page was inspected when it was not. Reference documents are
  text sources, not live screenshots.

## Licensing

Original TastePro content is Apache-2.0. Upstream-derived content remains under
its source license. See `ATTRIBUTION.md`, `NOTICE`, and
`content/sources/licenses/`.

When adding content:

- If it is derived from an upstream source, record the pin and license.
- If it is original, use `source: "tastepro"` and `commit: "workspace"`.
- If it is inspired by a brand or site, write an original analysis; do not copy
  text, assets, or code.
- Never add a third-party screenshot or logo.

## Content checklist

- [ ] Id is stable, lowercase, and kind-prefixed.
- [ ] Summary is one decision-oriented sentence.
- [ ] Domains use canonical taxonomy ids.
- [ ] Quality matches the actual review level.
- [ ] Provenance is complete and accurate.
- [ ] No brand assets, third-party screenshots, or copied prose.
- [ ] Recommendations point to real ids.
- [ ] `npm run ingest` (if generated) and `npm run validate` pass.
- [ ] `npm test` passes.
- [ ] The diff is reviewed, especially generated files and the content hash.
