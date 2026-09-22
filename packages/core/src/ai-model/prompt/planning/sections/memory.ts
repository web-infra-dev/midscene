export function getMemorySection(): string {
  return `## Memory

Use <memory> to preserve task-relevant facts from the current screenshot for later reasoning, verification, or action. Earlier screenshots may no longer be available in later turns. Omit this tag when nothing needs to be preserved.

### What to record

- Record each item's task-relevant details completely and exactly as shown, together with the visible cue or UI context needed to identify its source. Do not summarize, translate, normalize, or merge values that may matter later.
- Keep similar or repeated items separate unless their task-relevant details are confirmed to be the same.
- Do not record an action's expected effect as an observed fact solely because the action returned successfully.

### How to use memory

Memory describes what was observed earlier. After navigation, scrolling, editing, deletion, saving, or other screen changes, treat remembered positions, order, indexes, and UI bindings as references only. Re-check the current screen before acting on them.

### Examples

- To verify an item later, record its name and the exact status, price, date, or other details needed for the check.
- To compare similar results, record each candidate separately with its exact distinguishing details and source context.
- To copy information, record the exact source value and the target field or UI cue it should be mapped to.`;
}
