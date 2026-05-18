# aiAct Image Prompting Plan

## Background

`aiTap` and other locate-style APIs already accept `TUserPrompt`, so callers can
pass a prompt object with reference images:

```ts
await agent.aiTap({
  prompt: 'Click the target logo',
  images: [{ name: 'logo', url: 'https://example.com/logo.png' }],
  convertHttpImage2Base64: true,
});
```

`aiAct` currently accepts only a string instruction. The goal is to let the first
argument of `aiAct` use the same image prompting shape as `aiTap`:

```ts
await agent.aiAct({
  prompt: 'Complete the flow using the button that matches logo1',
  images: [{ name: 'logo1', url: './fixtures/logo.png' }],
});
```

## Current Behavior

- `Agent.aiAct(taskPrompt: string)` and `Agent.aiAction(taskPrompt: string)` are
  string-only in `packages/core/src/agent/agent.ts`.
- `TaskExecutor.action()` and `runAction()` pass `userPrompt: string` through
  the planning loop in `packages/core/src/agent/tasks.ts`.
- Planning task dumps store `param.userInstruction: string` in
  `packages/core/src/types.ts`.
- Planning model adapters accept `userInstruction: string`:
  - `packages/core/src/ai-model/llm-planning.ts`
  - `packages/core/src/ai-model/ui-tars-planning.ts`
  - `packages/core/src/ai-model/auto-glm/planning.ts`
- `aiAct` plan cache uses `PlanningCache.prompt: string`, while locate cache
  already uses `LocateCache.prompt: TUserPrompt`.

## Desired Behavior

- `aiAct`, `aiAction`, and `ai` accept `TUserPrompt`.
- Text-only calls remain fully backward compatible.
- Reference images are sent to the planning model as supporting context, not as
  screenshots of the current UI.
- Plan cache matching and writing follows the same rule as `aiTap`: store and
  compare the complete prompt object, including `images[].url` and
  `convertHttpImage2Base64`.
- Base64 data URLs are stored as-is in cache/report data, matching current
  `aiTap` behavior.
- Default LLM planning, UI-TARS planning, and Auto-GLM planning should all
  support image prompting in the same change.
- Reports and replay metadata should display a readable text instruction while
  preserving attached reference images.

## Proposed Implementation

### 1. Extend public types

- Change `Agent.aiAct(taskPrompt: string, opt?: AiActOptions)` to
  `Agent.aiAct(taskPrompt: TUserPrompt, opt?: AiActOptions)`.
- Change `Agent.aiAction()` accordingly.
- `Agent.ai()` should follow automatically because it uses
  `Parameters<typeof this.aiAct>`.
- Update `MidsceneYamlFlowItemAIAction` so `aiAct`, `aiAction`, and `ai` can be
  `TUserPrompt`.
- Update docs for `agent.aiAct()` in both English and Chinese API pages.

### 2. Normalize prompt text and multimodal prompt

Reuse the existing `parsePrompt()` behavior from `packages/core/src/agent/utils.ts`:

- `textPrompt` is used for task titles, logs, YAML task names, and the textual
  `<user_instruction>` block.
- `multimodalPrompt` carries `images` and `convertHttpImage2Base64`.

The existing image preprocessing behavior should be preserved:

- Local paths become Base64 data URLs.
- HTTP(S) links remain links unless `convertHttpImage2Base64: true`.
- Existing Base64 data URLs are passed through.

### 3. Add shared reference-image message helper

The reference-image message construction currently lives near locate/inspect
logic. Extract or add a shared helper, for example:

```ts
buildMultimodalPromptMessages(multimodalPrompt?: TMultimodalPrompt)
```

It should produce messages equivalent to the current `aiTap` image prompting
behavior:

- State that the images are reference images.
- Include each image by `name`.
- Send the processed image URL/data URL with `detail: 'high'` where supported.

### 4. Update planning adapters

For default LLM planning:

- Use `textPrompt` in `<user_instruction>`.
- Insert reference-image messages after the text instruction and before the
  latest screenshot/history messages.
- Avoid putting reference images into `conversationHistory.snapshot()` if they
  could be removed by `imagesIncludeCount`.

For UI-TARS planning:

- Keep the existing prompt format based on `getUiTarsPlanningPrompt()`.
- Append reference-image messages before the current screenshot message.
- Support image prompting in the same change as default LLM planning.
- Keep the current UI screenshot clearly separated from reference images.

For Auto-GLM planning:

- Keep the current screenshot as the last/current UI image.
- Do not let `conversationHistory.snapshot(1)` drop reference images
  accidentally. Prefer passing reference-image messages outside the snapshot or
  raising the image limit to include `1 + referenceImages.length`.
- Support image prompting in the same change as default LLM planning.

### 5. Update plan cache

Align plan cache with locate cache:

- Change `PlanningCache.prompt` from `string` to `TUserPrompt`.
- Change `matchPlanCache(prompt: string)` to accept `TUserPrompt`.
- Keep `matchCache()` deep-equality matching as the source of truth.
- When writing plan cache, store the original prompt object, including image
  URLs. This intentionally follows `aiTap` cache behavior.

Cache implications:

- Same text with different images should not share a plan cache entry.
- Same image content under a different URL/path is a different cache key.
- Passing a large Base64 data URL will make the cache file large, matching
  current `aiTap` behavior.
- This behavior is intentional for the first implementation. Do not add
  aiAct-specific redaction or cache disabling for image prompts.

### 6. Update reports and replay display

- Let planning task params keep `userInstruction: TUserPrompt`.
- Display only the readable `prompt` text in report summaries, but attach
  `images` to the planning input detail view.
- Check `paramStr()` and replay script subtitles so object-form instructions do
  not render as noisy JSON unless that is intentional.

### 7. YAML support

Support both direct object-form YAML and sibling prompt-field YAML. The direct
object form is preferred because it mirrors the JavaScript API.

Preferred:

```yaml
tasks:
  - name: Verify logo flow
    flow:
      - aiAct:
          prompt: Complete the flow using the button that matches logo1.
          images:
            - name: logo1
              url: ./fixtures/logo.png
          convertHttpImage2Base64: true
```

Compatible:

```yaml
tasks:
  - name: Verify logo flow
    flow:
      - aiAct:
        prompt: Complete the flow using the button that matches logo1.
        images:
          - name: logo1
            url: ./fixtures/logo.png
        convertHttpImage2Base64: true
```

Text shorthand stays unchanged:

```yaml
- aiAct: Click the login button
```

## Suggested Tests

Unit-level tests to add later:

- `Agent.aiAct({ prompt, images })` passes text and reference images into the
  selected planning adapter.
- Plan cache stores and matches a full `TUserPrompt` object.
- Same text with different `images[].url` does not hit the same plan cache.
- YAML player forwards object-form `aiAct` to `agent.aiAct()`.
- Report detail extracts planning reference images from `userInstruction`.

AI/e2e tests can be optional because the main risk is plumbing and message
construction, not model behavior.

## Open Questions

None.

## Confirmed Decisions

- `aiAct` image prompts follow `aiTap` cache behavior: the full prompt object is
  cached and deep-equality matched.
- Base64 data URLs are stored as-is in cache/report data for the first
  implementation.
- UI-TARS and Auto-GLM planning are included in the same image prompting change.
- YAML supports both `aiAct: { prompt, images }` and sibling
  `aiAct: null`/`prompt`/`images` style forms, with direct object form preferred.
- Bridge-mode CLI-side should inherit the core `Agent.aiAct` implementation.
  It should not keep a separate `aiAct` override because that risks diverging
  from core argument support.
