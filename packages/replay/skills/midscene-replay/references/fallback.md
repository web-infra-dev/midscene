# Locator fallback

Scripts should keep running when a page is restyled or restructured. Strict XPath is always tried first. Only when it stops identifying the target **before dispatch** (`TARGET_MISSING` after the readiness budget, `TARGET_AMBIGUOUS` or `TARGET_GUARD_MISMATCH`) can an opted-in action recover. Fallback never retries a dispatched action, never applies to reads, and is limited to `tap`, `hover`, `doubleClick` and `input`.

## Two tiers

| `fallback` | Recovery | Model | Requirements |
| --- | --- | --- | --- |
| `'guard'` | The unique element in `within` that matches the guard | none | identity guard (`text` or `attr`) |
| `'locate'` | Guard tier first if the guard has identity; then one bounded `aiLocate` whose answer must lie in `within` and satisfy the guard | locate model | `postcondition` (or `opensPage`) |

- **Identity guard** (`text` or `attr`): an exact business identity. With `'guard'` it re-finds the target deterministically. If it matches nothing, the action fails without a model call; the AI tier only runs when several elements match.
- **Constraint guard** (`tag`, `role` only): use with `'locate'` when even the identity may change (new wording, removed attributes). The model chooses; the guard and scope bound the answer; the **postcondition** proves the outcome.
- `sideEffect: true` (submit, delete, pay, global changes) and `opensPage` actions need an identity guard for any fallback.
- The AI answer is mapped to the nearest ancestor matching the guard (or an interactive element), then checked for scope, editability for `input`, visibility and hit testing, and re-sampled twice. The page, document and viewport must not change during the model call. Rejections dispatch nothing.

```js
// Restyled button: re-find by its accessible name, no model.
await rp.tap('保存草稿按钮', {
  candidates: [{ xpath: '//button[@data-testid="save"]' }],
  guard: { tag: 'button', attr: { 'aria-label': '保存草稿' } },
  fallback: 'guard',
});

// Wording may change: let the model choose inside the row, then prove it.
const row = '//*[@role="row"][.//span[normalize-space(.)="草稿 B"]]';
await rp.tap('草稿 B 那一行的「查看详情」入口', {
  within: { xpath: row },
  candidates: [{ xpath: './/a[@data-testid="detail"]' }],
  guard: { role: 'link' },
  fallback: 'locate',
  postcondition: () =>
    rp.waitFor(() => document.querySelector('h1')?.textContent === '草稿 B', {
      timeoutMs: 3000,
    }),
});

// Side effects keep an identity guard even with the model tier.
await rp.tap('草稿 B 那一行的删除按钮', {
  within: { xpath: row },
  candidates: [{ xpath: './/button[@data-testid="delete"]' }],
  guard: { role: 'button', text: '删除' },
  sideEffect: true,
  fallback: 'locate',
  postcondition: () =>
    rp.waitFor(
      (name) =>
        ![...document.querySelectorAll('[role="row"]')].some((r) =>
          r.textContent.includes(name),
        ),
      { args: ['草稿 B'], timeoutMs: 3000 },
    ),
});
```

## Policy

Native Test `--replay=strict` disables locator fallback on attached implementations and fails the node when its script fails. `auto` allows declared guard/locate helpers and hands an unsuccessful script to the original ai* node on the current page. This whole-node native path may repeat an action already applied by the script; it follows native behavior and has no Replay dispatch gate.

Accept with three full strict runs. Separately exercise dynamic page variants with `midscene-test case.yaml --replay=auto`; inspect native report evidence for the actual locator tier, resolved business identity and postcondition. A visual `rp.verify` does not demonstrate locator fallback. Keep baseline and variant evidence distinct.

A strict failure with an identity guard can emit a read-only `heal` suggestion. `verify` links it in heal.json. There is no YAML fallback enum and no duplicate flow retry strategy.
