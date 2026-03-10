# AGENTS.md

Canonical instructions for coding agents in this repository. `CLAUDE.md`
should point here instead of duplicating rules.

## Default Workflow

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

## Validation Guidance

- Docs-only change: usually `pnpm run lint` is enough.
- Single-package code change: run `pnpm run lint` plus the smallest relevant
  `npx nx test <project>` and, if exports/build wiring changed,
  `npx nx build <project>`.
- Cross-package runtime or build-system change: run `pnpm run lint` and say
  explicitly if broader validation is still outstanding.
