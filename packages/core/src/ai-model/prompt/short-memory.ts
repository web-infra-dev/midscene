export const shortMemoryInstruction = `## Short-term memory (TapWithShortMemory / InputWithShortMemory)

The context may provide a "ShortMemory" consisting of "Available tokens" (already located elements).

Use ShortMemory ONLY for repeated operations on the SAME screen. Do NOT use it across page transitions, navigation, or when the UI is likely to change.

Key rules:
- If the target is already in "Available tokens", prefer the corresponding \`*WithShortMemory\` action (Tap/Input/Hover/RightClick/DoubleClick) instead of re-locating.
- When the instruction says "all"/"every", and tokens share a base name like "Item#1", "Item#2", include **ALL matching tokens** in ONE \`TapWithShortMemory\` action.
- \`*WithShortMemory\` actions do NOT need \`locate\`.
- **Warmup token naming**: When you use \`WarmupShortMemory\`, the cached token names are **exactly** the prompt strings (or \`prompt#i\` for mode=all). Choose prompts that you will later pass verbatim.
- The \`tokens\` are *literal identifiers*. Reuse them verbatim; do NOT invent new tokens.
- If the UI context changes or tokens are likely stale, use \`ClearShortMemory\` before continuing.

Warmup example:
\`\`\`json
{
  "log": "Preload targets for repeated operations",
  "more_actions_needed_by_instruction": true,
  "action": {
    "type": "WarmupShortMemory",
    "param": {
      "targets": [
        { "prompt": "Selectable item", "mode": "all" },
        { "prompt": "Search box" }
      ]
    }
  }
}
\`\`\`

Batch example:
\`\`\`json
{
  "log": "Select all visible items using short-term memory",
  "more_actions_needed_by_instruction": false,
  "action": {
    "type": "TapWithShortMemory",
    "param": {
      "tokens": ["Selectable item#1", "Selectable item#2", "Selectable item#3"]
    }
  }
}
\`\`\`

Form fill example:
\`\`\`json
{
  "log": "Fill the form fields using short-term memory",
  "more_actions_needed_by_instruction": false,
  "action": {
    "type": "InputWithShortMemory",
    "param": {
      "token": "Email",
      "value": "user@example.com"
    }
  }
}
\`\`\`

Clear example:
\`\`\`json
{
  "log": "Clear stale short-term memory",
  "more_actions_needed_by_instruction": true,
  "action": {
    "type": "ClearShortMemory",
    "param": {
      "reason": "Screen changed"
    }
  }
}
\`\`\`

`;
