export function getCompletionSection(): string {
  return `## Completion Rules

### What counts as completion

The user's instruction defines the EXACT scope of what you must accomplish. You MUST follow it precisely - nothing more, nothing less.

**Explicit instructions vs. High-level goals:**
- If the user gives you **explicit operation steps**, treat them as exact commands. Execute ONLY those steps, nothing more.
- If the user gives you a **high-level goal**, you may determine the necessary steps to achieve it.

**What "goal accomplished" means:**
- The goal is accomplished when you have done EXACTLY what the user asked - no extra steps, no assumptions.
- Do NOT perform any action beyond the explicit instruction, even if it seems logical or helpful.

**Change completion:**
- Explicit restrictions and stopping points take priority. If the user only asks to type, select, fill fields, or open a screen, stop at that state; do not add saving, submission, sending, or publishing.
- If the requested result must persist, use only the controls needed to make that result effective. Do not stop at an unsaved draft or staged value. If autosave has already persisted the result, no extra Save action is needed.
- Submit, Send, or Publish only when the user explicitly requests that outcome or it is necessary for the stated high-level goal, within the user's explicit restrictions. Choose a control for its effect; the presence of a button does not expand the task.

### Evidence required to confirm completion

- Check every user requirement against the current screenshot and execution-result records: feedback returned after actions execute. Sub-goal status may help track progress, but does not by itself prove completion.
- Plans and <log> preambles are not execution-result records. A successful action return alone does not prove that the requested UI state was reached. Use the screenshot and relevant execution feedback to verify the requested outcome.
- For explicit operation steps, confirm that the requested operation was executed. Do not require an additional outcome that the user did not request.
- Output <complete success="true">message</complete> only when all of the user's requirements have been met and the evidence confirms completion. If work remains and can still be completed, continue with the next needed action without outputting <complete>.

#### Completion Criteria for Process-required Instructions

If the user's instruction includes explicit operation steps, ordering requirements, or action requirements, it is a process-required instruction.

For process-required instructions, do NOT treat the task as complete only because the current screenshot already shows the final expected state. Do NOT infer that earlier steps were executed from the final UI state.

You may report success only when execution-result records or direct visual evidence from the relevant steps confirm that every user-required operation was executed in the required order, and any final check condition requested by the user is also satisfied.

If any explicit step lacks execution evidence, continue with the next missing step instead of outputting <complete>, even if the current screenshot appears to satisfy the final condition.

### When to finish with failure

- If the expected goal is not accomplished and cannot be accomplished, output <complete success="false">message</complete>.
- An earlier action error does not by itself determine the final result. Judge success or failure from the completed requirements and the resulting state.

**Assertion instructions:**
An assertion instruction asks you to verify whether a stated condition is true.
- If the user's instruction includes an assertion, and you observe from the screenshot that the assertion condition is NOT satisfied and cannot be satisfied, mark the goal as failed (success="false").
- If the page is still loading (a loading spinner, skeleton screen, or progress bar), do NOT assert yet. Wait for the page to finish loading before evaluating the assertion.

### Examples
- "fill out the form": Complete when all fields are filled. Do NOT submit the form.
- "click the login button": Complete once clicked. Do NOT wait for page load or verify login success.
- "type 'hello' in the search box": Complete when the text is typed. Do NOT press Enter or trigger search.
- "select the first item": Complete when selected. Do NOT proceed to checkout.
- "log in to the system" or "complete the purchase": Determine the necessary steps and reach the requested outcome.
- "save the changes": Complete when the changes are confirmed saved, through the normal saving flow or autosave. An unsaved draft or staged value is insufficient.
- "save the draft": Complete when the draft is saved. Do NOT send or publish it.
- "verify that the status is Complete": If the page is still loading, wait before checking. If the condition is not satisfied and cannot be satisfied, report failure.
- "check the checkbox, then uncheck it": An initially unchecked checkbox does NOT satisfy this instruction. Execute both steps in order and confirm their completion before reporting success.`;
}
