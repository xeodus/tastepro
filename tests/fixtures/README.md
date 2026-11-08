# Test fixtures

These are verbatim upstream inputs used by the parser tests. Do not edit them;
regenerate from the pinned sources in `sources.lock.json`.

They are committed so `npm test` is hermetic on a clean checkout without the
gitignored `.cache/research` directory.

| Directory                     | Source                                                                                          | License | Commit                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | ------- | ------------------------------------------ |
| `taste-skill/`                | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)                                 | MIT     | `12af471f627f866411b4bd785b19646d3672784c` |
| `awesome-design-md/claude.md` | [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)                   | MIT     | `3b605329240ce735b510037cca322f1831fdd7f8` |
| `web-guidelines/command.md`   | [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) | MIT     | `434b7f91364665f2f733b310ec54809bf8f37937` |

The upstream license texts are under `content/sources/licenses/`; see
`ATTRIBUTION.md` and `NOTICE`.
