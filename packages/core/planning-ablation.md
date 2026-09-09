# Planning component ablation

[中文](./planning-ablation.zh.md)

Use one environment variable to ablate standard Planning components. No YAML changes or new `aiAct` options are required.

```bash
# Keep these settings identical in every arm; run each arm in its own process.
export MIDSCENE_CACHE=false
export MIDSCENE_RECORD_MODEL_CALL=1

# Full baseline: unset or empty preserves existing behavior.
export MIDSCENE_PLANNING_DISABLE_PARTS=

# Remove memory, combine components, or remove all examples.
export MIDSCENE_PLANNING_DISABLE_PARTS=memory
export MIDSCENE_PLANNING_DISABLE_PARTS=memory,subGoals
export MIDSCENE_PLANNING_DISABLE_PARTS=examples
```

Choose one setting, then run the existing benchmark command. Names are case-sensitive CSV entries; whitespace and duplicates are accepted. Unknown names throw. Each `aiAct` reads and freezes its configuration at entry; changes to the environment affect subsequent calls only.

## Components

| Name | Removed content |
| --- | --- |
| `taskScope` | Strict task-scope instructions and examples, including matching Input parameter guidance |
| `durableCompletion` | Guidance for completing durable changes through save/submit/apply controls |
| `processEvidence` | Instructions requiring execution evidence, including the first-call no-history reminder |
| `observationGuidance` | Detailed observation advice for thumbnails, partial views and precise details |
| `planningText` | `<planning>` instructions, examples, effective output and replay |
| `subGoals` | Decomposition, updates, completion markers, examples and sub-goal history organization |
| `memory` | Memory instructions, examples, effective output, writes, summaries and replay |
| `log` | Model preambles, action-derived logs, sub-goal/flat log summaries and replay |
| `scrollableOptions` | Dropdown search, incremental scrolling and selection strategy |
| `inputVerification` | The special rule against rechecking typed text through the screenshot |
| `assertionTiming` | Assertion failure and wait-for-loading guidance |
| `recoveryGuidance` | General retry/recovery advice and recovery log examples |
| `adbPreference` | Preference for RunAdbShell; the action remains available |
| `sliderSwipe` | Swipe preference for sliders, including the slider example in the Swipe description |
| `incrementalEdit` | Minimal text edits, cursor strategy and its specific recovery guidance, including Input.mode advice |
| `navigationRestriction` | Instructions restricting execution to the current page |
| `actionDescriptions` | Action and parameter prose; names, types, defaults, optionality, coordinate contracts and implementations remain |
| `groundingGuidance` | The seven shared element-locating rules throughout the same aiAct: inline Planning, independent Locate and applicable fallback calls |
| `returnFormatReminder` | The final repeated Return Format section; earlier output protocol rules remain |
| `ruleExamples` | Short explanatory rule examples, memory examples and log examples |
| `subGoalExample` | The long login/todo/registration sub-goal example |
| `actionExamples` | Action-list samples and standalone Tap/error examples |
| `multiTurnExample` | The complete five-turn form example |

Group aliases expand into concrete components in the report:

| Alias | Components |
| --- | --- |
| `taskSemantics` | `taskScope,durableCompletion,processEvidence` |
| `uiCases` | `scrollableOptions,inputVerification,assertionTiming` |
| `actionStrategies` | `recoveryGuidance,adbPreference,sliderSwipe,incrementalEdit,navigationRestriction` |
| `examples` | `ruleExamples,subGoalExample,actionExamples,multiTurnExample` |

## Experimental boundaries

Disabled output fields cannot update effective state or enter subsequent framework replay, even if the model still emits them. Reports retain original `rawResponse`/`rawChoiceMessage` for auditing. User values inside action JSON and terminal complete/error text are preserved rather than deleted by keyword. Malformed responses with ambiguous action-JSON boundaries enter the existing parse-error/retry path to avoid corrupting user data or leaking disabled fields.

Keep the original instruction, user context, execution feedback, action capabilities, coordinate protocol, model routing, images and preprocessing, step limits, and history compression fixed. Removing `<planning>` does not disable provider reasoning. Removing memory does not erase information available in retained actions, screenshots or ordinary text: the treatment is removal of the explicit memory mechanism.

Resolve the original effort profile before removing components. Use an existing deepThink baseline to test prompted memory, sub-goals or observation guidance, and keep effort fixed across arms. Removing sub-goals does not switch to balance or enable flat history as compensation; retained logs still replay through their original assistant field. Nested examples disappear with their parent component, even if the corresponding example switch remains enabled.

This experiment supports the standard Midscene Planning protocol. Custom Planning and standard protocols with replaced core builders are rejected. Adapters requiring verbatim assistant-message replay reject `memory/subGoals/planningText/log` ablation. Custom Locate rejects `groundingGuidance`. These checks happen before inference.

Disable caches in all arms so existing plans cannot skip Planning and cached coordinates cannot bypass Grounding. An explicit Agent cache object can override `MIDSCENE_CACHE=false`; active ablation then throws. Disable that configuration in the common experiment entry point, or consistently use the existing `cacheable: false` option. Keep effort, models, temperature, tasks, step limits and judges identical across arms as well.

Planning task parameters record expanded `disabledPlanningParts`; the empty baseline adds no field. In Node, use `MIDSCENE_RECORD_MODEL_CALL=1` to audit actual requests under the run directory's `model-requests`, and verify that files were written.

Start with a full baseline and one-component removals, then test combinations with meaningful signals. Use matched tasks and repetitions; record success, model calls, input/output tokens, latency, invalid output and infrastructure failures. Each removal estimates its contribution within the current complete system. This alone does not identify all interactions or constitute an orthogonal design.
