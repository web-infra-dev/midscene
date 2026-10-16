# RFC 0002: TypeSafe Jev as a typed decision provider

Status: **Draft / Request for feedback**

## Summary

Add optional support for [TypeSafe Jev](https://docs.typesafe.ai/) as a typed
decision provider alongside Midscene's existing planning, insight, and locate
models.

Jev should not be registered as a `MIDSCENE_MODEL_FAMILY`. It is not an
OpenAI-compatible chat or vision model and cannot replace the model that reads
screenshots or returns coordinates. Instead, it can make narrow semantic
judgments over textual application state and return typed choices,
probabilities, and confidence values that Midscene uses in code.

The first integration should be an opt-in planning gate that reviews a proposed
action before execution and chooses one of three outcomes:

- `accept`: execute the proposed action.
- `replan`: reject it and ask the current planning model for another plan.
- `stop`: do not execute because the action conflicts with the instruction or
  an explicit policy.

I am available to implement this proposal after the API and initial scope are
agreed upon.

## Motivation

Midscene already separates planning, insight, and localization model slots, but
all three are generative model workflows. Some orchestration decisions are
smaller and closed-ended:

- Does this planned action match the user's instruction?
- Is the action allowed by an application policy?
- Should a failed action be retried, replanned, or escalated?
- Which one of a fixed set of workflows should handle a request?

These decisions do not need free-form text generation. Jev's `Choice`, `Noul`,
and `Score` primitives return bounded answers and probabilities that application
code can consume directly. This could add an explicit confidence-aware control
point without changing Midscene's visual grounding pipeline.

## Goals

1. Keep the existing visual planning and localization behavior unchanged by
   default.
2. Make the integration opt-in and provider-specific code optional.
3. Preserve code ownership of thresholds, fallback behavior, and execution.
4. Record decision results in Midscene reports for debugging and evaluation.
5. Support cancellation, timeouts, and token usage reporting consistently with
   existing model calls.

## Non-goals

- Using Jev to read screenshots or return element coordinates.
- Replacing `MIDSCENE_MODEL_*`, `MIDSCENE_PLANNING_MODEL_*`, or
  `MIDSCENE_INSIGHT_MODEL_*` configuration.
- Automatically blocking actions based only on a low-confidence result.
- Sending API keys to browser-side code.
- Adding a generic multi-provider abstraction before a second decision provider
  exists.

## Proposed API

Add one narrow hook to `AgentOpt`:

```ts
export interface PlanningDecisionInput {
  instruction: string;
  action: PlanningAction;
  actionSpace: DeviceAction[];
  previousActions: Array<{
    action: PlanningAction;
    outcome: 'succeeded' | 'failed';
  }>;
}

export interface PlanningDecision {
  outcome: 'accept' | 'replan' | 'stop';
  confidence: number;
  metadata?: unknown;
}

export type PlanningDecisionProvider = (
  input: PlanningDecisionInput,
  options: { signal?: AbortSignal },
) => Promise<PlanningDecision>;

export interface AgentOpt {
  planningDecisionProvider?: PlanningDecisionProvider;
}
```

The core hook is intentionally a function rather than a provider registry or
class hierarchy. Applications that do not use it pay no dependency or runtime
cost.

The TypeSafe integration can be a small optional adapter:

```ts
import { createJevPlanningDecisionProvider } from '@midscene/typesafe';

const agent = new Agent(interfaceInstance, {
  planningDecisionProvider: createJevPlanningDecisionProvider({
    apiKey: process.env.TYPESAFE_API_KEY,
    model: 'jev-latest',
    minConfidence: 0.75,
  }),
});
```

The adapter would use a `Choice` for the outcome and a companion `Noul` for
explicit policy violations. Independent questions should be sent together in a
single TypeSafe request.

## Execution flow

1. The existing planning model returns a `PlanningAction`.
2. Midscene builds textual state from the user instruction, proposed action,
   action schema, and prior action outcomes.
3. The optional decision provider evaluates that state.
4. Midscene applies the returned outcome only when it meets the configured
   confidence threshold.
5. Low-confidence answers and provider failures fall back to current behavior
   (`accept`) unless the application explicitly selects fail-closed behavior.
6. `replan` appends bounded feedback to the existing conversation history and
   consumes one replanning cycle.
7. `stop` ends the task with a distinct policy/decision error rather than
   reporting an execution failure.

The provider must not receive screenshots. A later proposal may pass textual
evidence produced by the insight model, but that is outside this RFC.

## Reporting and observability

Each decision should be attached to the planning task log:

```ts
{
  provider: 'typesafe-jev',
  model: 'jev-1.x',
  outcome: 'accept',
  confidence: 0.93,
  probabilities: {
    accept: 0.93,
    replan: 0.06,
    stop: 0.01,
  },
  usage: {
    inputTokens: 320,
    outputTokens: 24,
  },
}
```

The exact provider response may be retained in the execution dump, while the
normal report should show only the normalized outcome, confidence, latency, and
usage.

## Security and privacy

- Read `TYPESAFE_API_KEY` only in Node.js/server environments.
- Never serialize credentials into reports, browser bundles, generated YAML, or
  Studio configuration exports.
- Document that textual instructions, plans, and prior outcomes are sent to the
  configured TypeSafe endpoint.
- Reuse Midscene's existing abort and timeout plumbing.

## Implementation plan

1. Add the `PlanningDecisionProvider` types and the optional `AgentOpt` hook.
2. Invoke the hook between planning and action execution.
3. Add unit tests for `accept`, `replan`, `stop`, low confidence, provider
   failure, and abort behavior using an injected fake provider.
4. Add the optional TypeSafe adapter using `@typesafe-ai/sdk` and
   `TYPESAFE_API_KEY`.
5. Add an AI test fixture that records Jev responses so normal CI does not need
   external credentials.
6. Document setup, data flow, fallback policy, and a minimal example in English
   and Chinese.

## Alternatives considered

### Register Jev as a model family

Rejected. The current model-family contract expects chat/vision behavior and
coordinate adaptation. Jev exposes a different typed-decision API.

### Call TypeSafe directly from core

Rejected for the first version. It would add a provider dependency for every
Midscene user and make testing harder. The injected hook keeps core small and
the adapter optional.

### Use Jev as a complete planner

Deferred. A planner must handle open-ended parameters, screenshots, and element
localization. A bounded decision gate is a smaller integration that matches
Jev's current strengths and can be evaluated independently.

## Open questions

1. Should `stop` throw a new typed error or return a normal finalized task?
2. Should provider failure default to fail-open globally, or should the hook
   return its desired fallback policy?
3. Should the optional adapter live in this monorepo as `@midscene/typesafe`, or
   start as a documented external package until usage is proven?
4. Is post-plan verification the best first use case, or would maintainers
   prefer request routing or assertion verification as the initial integration?
