# Planning component experiments

[中文](./planning-ablation.zh.md)

Standard Planning no longer accepts the `deepThink` or `effort` mode options. Components are enabled by default and independently disabled with `MIDSCENE_PLANNING_DISABLE_PARTS`. SDK, MCP/CLI and Playground use the same mechanism; no new YAML configuration structure is needed.

```bash
# Separate process per arm; identical cache and recording settings in every arm.
export MIDSCENE_CACHE=false
export MIDSCENE_RECORD_MODEL_CALL=1

# Complete baseline
export MIDSCENE_PLANNING_DISABLE_PARTS=
# Remove sub-goals, their dedicated example and their content in shared examples.
export MIDSCENE_PLANNING_DISABLE_PARTS=subGoals
# Combined removal
export MIDSCENE_PLANNING_DISABLE_PARTS=subGoals,memory
```

Choose a setting and run the existing benchmark command. Only the component names listed below are accepted, separated by commas. Names are case-sensitive; whitespace and duplicates are accepted. Unknown names throw. Each `aiAct` reads and freezes its settings at entry; environment changes cannot affect an ongoing call.

## Components

| Name | Effect of disabling |
| --- | --- |
| `taskScope` | Strict task scope, its examples and Input parameter guidance |
| `durableCompletion` | Save/submit/apply completion guidance |
| `processEvidence` | Execution-evidence rules and the initial no-history reminder |
| `observationGuidance` | Detailed observation advice for partial views and the example of finding a target before clicking it |
| `planningText` | Planning text, its examples, parsed output and replay |
| `subGoals` | Sub-goal instructions, all owned examples, updates, completion markers, state, grouped logs and replay; enabled logs become flat history when this is off |
| `memory` | Memory instructions, all owned examples, output, writes, summaries and replay |
| `log` | Model log instructions, all owned examples, output, grouped/flat summaries and replay |
| `screenshotHistory` | The previous screenshot: keep only the latest screenshot instead of two |
| `separateLocate` | Separate Planning/Locate calls: merge localization into Planning when using the default model; an explicitly configured Planning model remains separate |
| `scrollableOptions` | Dropdown search and incremental-scrolling guidance |
| `inputVerification` | The special rule against rechecking typed text through screenshots |
| `assertionTiming` | Assertion failure and loading-wait guidance and examples |
| `recoveryGuidance` | Retry/recovery advice and owned recovery examples |
| `adbPreference` | RunAdbShell preference; the action itself stays available |
| `sliderSwipe` | Slider Swipe preference and the slider example in the Swipe description |
| `incrementalEdit` | Minimal edits, cursor strategy, specific recovery and Input.mode guidance |
| `crossPageNavigation` | Autonomous cross-page navigation: disabling adds the current-page restriction and its examples; navigation explicitly requested by the user remains allowed |
| `groundingGuidance` | Shared locating rules in Planning, independent Locate and applicable fallbacks of this aiAct |
| `returnFormatReminder` | The final repeated Return Format section |
| `multiTurnExample` | The entire multi-turn form example |

## Ownership of capability examples

`subGoalExample` has been removed. `subGoals` owns the instructions, dedicated sub-goal example, sub-goal content in the multi-turn example, state and replay. Owned examples of memory, log, planningText, taskScope, recoveryGuidance, sliderSwipe and incrementalEdit also disappear with their capability. Shared examples retain content for other enabled capabilities.

`ruleExamples` has been removed. Rule examples belong to `taskScope`, `subGoals`, `memory`, `log`, `observationGuidance`, `assertionTiming` or `recoveryGuidance` and are enabled or disabled with their owner. The example of finding a target before clicking it belongs to `observationGuidance`. The recovery example belongs to `recoveryGuidance`; disabling `log` removes its XML wrapper while retaining the original example text. Current-page restrictions and their examples appear together when `crossPageNavigation` is disabled.

`actionDescriptions` and `actionExamples` are no longer configurable components. Basic action and parameter descriptions, action samples, their format guidance and standalone Tap/error examples are always retained in the standard Planning prompt, including when all optional components are disabled. Strategy-specific prose inside descriptions still follows its owner: `taskScope`, `incrementalEdit` or `sliderSwipe`.

Remove `actionDescriptions`, `actionExamples` and `ruleExamples` from existing `MIDSCENE_PLANNING_DISABLE_PARTS` values; they are now rejected as unknown components.

`multiTurnExample` controls the entire multi-turn form example, whose component-specific content still disappears when its owner is disabled. Disabling the multi-turn example does not remove standalone component examples. An action preference is distinct from the action itself: disabling `sliderSwipe` removes slider advice and its slider example, while retaining generic Swipe and non-slider samples.

The all-enabled baseline preserves the existing Planning prompt text and order. Component boundaries and switches do not rewrite rules, examples, log wording or execution feedback; disabling a component only removes its owned content and behavior.

## Replacing the old mode and experimental boundaries

The complete baseline enables sub-goals, memory, observation guidance, two screenshots, separate localization and cross-page navigation. This combination covers the mechanism choices previously selected by `deepThink=false`, without another mode switch:

```bash
export MIDSCENE_PLANNING_DISABLE_PARTS=subGoals,memory,observationGuidance,screenshotHistory,separateLocate,crossPageNavigation
```

It uses flat logs, one screenshot and inline localization when no dedicated Planning model is configured. This is a mapping of mechanisms, not byte equivalence with the old release: the old mode could accept spontaneous memory output even without prompting for it. Disabling memory now removes effective output, state and replay together.

Disabled fields cannot update state or enter framework replay even if the model emits them. Reports retain original `rawResponse`/`rawChoiceMessage`. User values in action JSON and complete/error text are preserved; malformed output with ambiguous action-JSON boundaries enters the existing parse-error/retry path.

Apart from each arm's selected components, hold instructions/context, real execution feedback, actions, model/temperature, image preprocessing, step limits, history compression and evaluators fixed. Disabling planning text does not control provider thinking. Memory removal tests the explicit mechanism; retained actions, screenshots and text can still convey past information.

Component experiments require the standard Midscene Planning protocol. Custom planners retain their own protocol with no overrides; explicit removals fail before inference. Standard protocols with replaced core builders also reject experiments. Adapters requiring verbatim assistant replay reject field ablation; custom Locate rejects groundingGuidance ablation.

Disable caches in every arm. An explicit Agent cache object can override MIDSCENE_CACHE=false and causes active experiments to throw. Remove that cache in the common entry point or consistently use cacheable: false.

Planning task parameters record includeSubGoals, includeLocateInPlanning, imagesIncludeCount and disabledPlanningParts (omitted when empty). Use MIDSCENE_RECORD_MODEL_CALL=1 to audit actual model-requests under the run directory, rather than checking environment variables alone.

Start with the complete baseline and individual removals, then test combinations with useful signals. Match tasks and repetitions; record success, model calls, tokens, latency, invalid output and infrastructure failures. Individual ablation measures a component's contribution in the complete system; it does not identify every interaction or constitute an orthogonal design.
