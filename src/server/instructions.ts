export const SERVER_INSTRUCTIONS = `TastePro is a design-taste and frontend-reference server for coding agents. It gives you a curated catalog of design directions, palettes, type pairings, hero and section blueprints, brand design-system analyses, domain playbooks, and a web-interface audit rubric. It is read-only and deterministic: it does not call an LLM and it does not browse the web.

Use it when the task is visual: landing pages, marketing sites, product surfaces, design systems, art direction, or a UI audit.

Workflow:
1. For an open brief, call taste_search with the product, audience, domain, mood, or visual idea. Start broad; use filters only when they help.
2. Call taste_get with the best ids. Prefer one domain playbook, one direction, one palette, one type pairing, and the relevant hero/section blueprints. Ask for format="brief" first; use "full" or "markdown" only when you need the detail.
3. For implementation or review, call taste_guidelines with the relevant category or query. Treat severity="error" rules as must-fix.
4. Build the page from the chosen system. Do not average many directions into a generic middle. Commit to one argument.

Rules:
- Never impersonate a brand or reuse its logo, copy, or assets. Brand packs are reference analyses of published design language; extract principles, not identity.
- Do not reproduce third-party screenshots. Site studies are text references; use them for structure and decisions.
- Cite the content id and upstream source when you rely on a pack. Provenance includes the pinned commit and license.
- Respect the response budget. Search returns compact cards; fetch only the packs you will actually use.
- If a domain has status="planned" or depth="taxonomy", say so. Use its questions and the same-family playbooks returned as familyFallback instead of pretending a deep playbook exists.
- Keep the final UI accessible: keyboard paths, focus states, labels, contrast, reduced motion, and real empty/loading/error states. The guidelines tool is the checklist, not decoration.`;

export const SKILL_MARKDOWN = `# TastePro skill

TastePro is a read-only MCP server for coding agents: design taste, domain playbooks, and frontend audits. It works over stdio (local) or Streamable HTTP (hosted).

## The three tools

### \`taste_search\`

Search the catalog by natural language, domain, mood, kind, quality, or source.

- \`query\`: product, audience, visual idea, or domain. Examples: "fintech dashboard", "quiet editorial portfolio", "restaurant menu", "dark developer tool".
- \`kind\`: optional filter. One of: direction, palette, type, hero, section, motion, site, brand, guideline, reference, domain, app-style, app-shell, app-pattern.
- \`domain\`: canonical domain id, such as \`fintech-payments\` or \`product-surfaces\`.
- \`quality\`: verified, reviewed, reference.
- \`limit\`: 1–50, default 12.
- \`maxTokens\`: response budget, default 1400.

Results are compact cards. Each has an \`id\`, \`kind\`, \`name\`, \`summary\`, \`domains\`, \`tags\`, \`quality\`, and sometimes metrics. If the query lands only on domains without authored playbooks, \`familyFallback\` lists same-family playbooks. Use them as references, not as domain-specific playbooks.

### \`taste_get\`

Fetch one or more packs by id.

- \`ids\`: a string or array of ids, such as \`domain/fintech-payments\`, \`direction/quiet-instrument\`, \`palette/white-navy-tab\`.
- \`format\`: \`brief\` (default), \`full\`, \`markdown\`, or \`json\`.
- \`maxTokens\`: response budget, default 2400.
- \`includeBody\`: include the full body of a reference pack instead of a 1,200-character excerpt.

### \`taste_guidelines\`

Query the pinned Vercel Web Interface Guidelines (104 rules).

- \`query\`: focus, contrast, motion, forms, overflow, images, navigation, etc.
- \`category\`: exact or partial category, such as "Accessibility" or "Focus States".
- \`severity\`: \`error\`, \`warn\`, or \`info\`.
- \`format\`: \`json\` or \`markdown\`. Markdown is a checklist.
- \`limit\`: 1–104, default 20.

## A good build sequence

1. **Frame the domain.** Search the product category and read its playbook: audience, jobs, trust, information architecture, anti-patterns, and questions.
2. **Choose one argument.** Pick a direction and read its idea, composition, typography, colour, imagery, motion, richness, and pitfalls. Do not blend five directions.
3. **Choose the system.** Pick a palette and type pairing that fit the direction. Check contrast; do not use a low-contrast pair for body text.
4. **Choose the bones.** Pick a hero and the sections the page actually needs. Use the section blueprints; do not add sections to fill a template.
5. **Build the real thing.** Use real content, real states, and real product evidence. A fake dashboard is worse than a plain page.
6. **Audit.** Query guidelines for the components you built. Fix every \`error\`, then the relevant \`warn\` rules.

## Content model

- **Domain playbooks** are the deepest layer: audience, jobs, trust signals, IA, conversion, content checklist, anti-patterns, signature moves, recommended directions and palettes, and questions to ask before designing.
- **Taxonomy-only domains** have questions and mappings but no deep playbook. \`taste_get\` returns \`familyFallback\` with complete playbooks from the same family; say that they are fallbacks.
- **Directions** are complete visual arguments, not mood words.
- **Palettes** include contrast checks.
- **Type pairings** include display/text families, sources, and CSS notes.
- **Heroes and sections** are structural blueprints with mobile behavior.
- **Brand packs** are analyses of published design systems. They are references, not templates to clone.
- **Site studies** are text analyses of third-party sites. No screenshots or logos are bundled.
- **References** include the full Taste Skill essays, photo-set metadata, Playwright CLI guidance, and the web-guidelines agent instructions.

## Attribution and licenses

Upstream content is pinned in \`sources.lock.json\` and \`content/generated/sources.json\`. The source libraries are MIT (Taste Skill, Awesome DESIGN.md, Vercel Web Interface Guidelines) and Apache-2.0 (Playwright CLI). TastePro's original code and content are Apache-2.0. See \`ATTRIBUTION.md\` and \`NOTICE\`.

## Hosted vs local

- Local stdio: \`npx tastepro --stdio\`. The client launches the process.
- Hosted HTTP: \`POST /mcp\` with Streamable HTTP. Read-only catalog calls may be anonymous; audit endpoints will require auth in a later milestone.
- Health: \`GET /healthz\`. Root: \`GET /\`.
`;
