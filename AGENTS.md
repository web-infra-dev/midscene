# AGENTS.md

Canonical instructions for coding agents in this repository. `CLAUDE.md`
should point here instead of duplicating rules.

## Design Principles

- Throw errors instead of returning blank values when something goes wrong.
- Report dump serialization format (`ScreenshotRef`, `ReportActionDump` JSON)
  does not need backward compatibility with older formats. Old report files are
  disposable and can be regenerated, so do not add legacy-format shims when
  changing the serialization schema.
- For warning logs in package code, prefer `getDebug(topic, { console: true })`
  over direct `console.warn(...)` so console output and Midscene log files stay
  aligned.

## Default Workflow

- NEVER force push anything unless you are explicitly told to do so.
- Use `pnpm` only. The workspace requires Node `>=18.19.0` and pnpm
  `>=9.3.0`.
- Read `CONTRIBUTING.md` before local development. Dev/build workflows,
  app-local dev servers, and report rebuild troubleshooting are maintained
  there to avoid duplication.
- Before creating a commit or updating a PR, run `pnpm run lint` from the
  repository root.
- For code changes, run the smallest relevant Nx target for each touched
  project instead of defaulting to full monorepo validation.
- AI tests require some environment variables like `MIDSCENE_MODEL_BASE_URL` to be set.

## Change Rules That Actually Matter

- Add or update tests when behavior changes. Start with the nearest unit test
  suite; use AI tests or e2e only when the change actually depends on model
  behavior or browser/device integration.
- Do not hand-edit generated output under `dist/` or `apps/site/doc_build/`.
- When changing shared packages or exported entry points, run a focused build
  for the affected project before finishing.

## Commit And PR Rules

- Commits must follow Conventional Commits with a required scope.
- Scope values come from directory names under `apps/` and `packages/`, plus
  shared scopes in `commitlint.config.js` such as `workflow`, `llm`,
  `playwright`, `puppeteer`, and `bridge`.
- Important mismatch: use `web-integration` as the commit scope for changes
  under `packages/web-integration`, even though the published package name is
  `@midscene/web`.
- Important mismatch: use `site` as the commit scope for `apps/site`, even
  though the Nx project name is `doc`.
- In PR summaries, list the actual validation commands you ran.

## Docs And I18n

- Treat user-facing docs as bilingual by default.
- If you edit `README.md`, update `README.zh.md` in the same change.
- If you edit `apps/site/docs/en/**`, inspect and update the corresponding
  file under `apps/site/docs/zh/**`. Do the same in the opposite direction.
- The English and Chinese trees are not perfectly mirrored. If the counterpart
  file does not exist, decide whether to add it or call out the intentional
  gap in your final summary.
- Before editing site copy, read `apps/site/agents.md` for terminology rules.
  It already documents translation constraints such as keeping `API Key` and
  `Agent` untranslated in Chinese where appropriate.

### Upgrading recommended models

`apps/site/docs/{en,zh}/model-strategy.mdx` and
`apps/site/docs/{en,zh}/model-common-config.mdx` are the source of truth for
which models we recommend and the exact model/family strings. When the
recommended models or their versions change (e.g. `qwen3-vl` → `qwen3.x`,
`gemini-3-flash` → `gemini-3.5-flash`), update the strategy/config docs first,
then propagate the new model names to every place that markets the supported
model list:

- `README.md` and `README.zh.md` (the "Driven by Visual Language Model"
  section).
- `apps/site/docs/en/introduction.mdx` and
  `apps/site/docs/zh/introduction.mdx` (same section).

Keep all four spots in sync and consistent with the strategy/config docs.
Leave historical references in `changelog.mdx` alone, and keep illustrative
"newer beats older" comparisons in `faq.md` intact. Remember README and
introduction are bilingual: update the en/zh counterparts in the same change.

## Validation Guidance

- Docs-only change: usually `pnpm run lint` is enough.
- Single-package code change: run `pnpm run lint` plus the smallest relevant
  `npx nx test <project>` and, if exports/build wiring changed,
  `npx nx build <project>`.
- Cross-package runtime or build-system change: run `pnpm run lint` and say
  explicitly if broader validation is still outstanding.
