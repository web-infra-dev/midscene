import type { PlanningActionOutputProtocol } from '../../model-adapter/planning-protocol';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import {
  buildActionOutputExample,
  createSampleInputAction,
  createSampleTapAction,
} from './action-output-example';

export const buildPlanningMultiTurnExample = ({
  locatePromptSpec,
  actionOutputProtocol,
  prefix,
}: {
  locatePromptSpec?: LocateResultPromptSpec;
  actionOutputProtocol: PlanningActionOutputProtocol;
  prefix?: string;
}) => `## Example

Use the actual Supporting actions list; these examples use Tap and Input.

### 1. Simple task: no sub-goals

**User instruction:** Type 'hello' in the search box. Do not search.

#### Turn 1
**Screenshot:** Empty, focused search box.
**Response:**
${prefix ? `${prefix}\n` : ''}<planning>I will enter 'hello' without starting a search. No sub-goals are needed.</planning>
<log>Type 'hello' in the search box.</log>
${buildActionOutputExample(createSampleInputAction('hello', {}), { locatePromptSpec, locateResultExampleIndex: 2, buildActionOutput: actionOutputProtocol.buildActionOutput })}

#### Turn 2
**Screenshot after Input:** The box contains 'hello'.
**Response:**
${prefix ? `${prefix}\n` : ''}<planning>The screenshot confirms the requested text. I will finish without pressing Enter.</planning>
<complete success="true">Entered 'hello' without starting a search.</complete>

### 2. Cross-page task: memory, sub-goals, and saving

**User instruction:** Use the company office address as order 1042's shipping address and save it. Keep billing unchanged. Return the saved shipping address.

#### Turn 1
**Screenshot:** Company profile: Office address "12 River Road"; link to order 1042's address settings.
**Response:**
${prefix ? `${prefix}\n` : ''}<planning>I will retain the office address, update shipping, and preserve billing.</planning>
<update-plan-content>
  <sub-goal index="1" status="pending">Order 1042's saved shipping address matches the company office address.</sub-goal>
  <sub-goal index="2" status="pending">Order 1042's billing address remains unchanged.</sub-goal>
</update-plan-content>
<memory>Company profile, Office address: 12 River Road</memory>
<log>Open order 1042's address settings.</log>
${buildActionOutputExample(createSampleTapAction('Address settings link for order 1042'), { locatePromptSpec, locateResultExampleIndex: 3, buildActionOutput: actionOutputProtocol.buildActionOutput })}

#### Turn 2
**Screenshot after Tap:** Order 1042 has separate Shipping and Billing fields, both showing "8 King Street".
**Response:**
${prefix ? `${prefix}\n` : ''}<planning>I will preserve the original billing address and replace shipping with the office address recorded earlier.</planning>
<memory>Order 1042, original Billing address: 8 King Street</memory>
<log>Set shipping to the office address.</log>
${buildActionOutputExample(createSampleInputAction('12 River Road', { locate: { prompt: 'Shipping address field in order 1042 settings' }, mode: 'replace' }), { locatePromptSpec, locateResultExampleIndex: 4, buildActionOutput: actionOutputProtocol.buildActionOutput })}

#### Turn 3
**Screenshot after Input:** Shipping: "12 River Road"; Billing: "8 King Street"; "Unsaved changes"; Save button.
**Response:**
${prefix ? `${prefix}\n` : ''}<planning>Shipping matches the source and billing is unchanged. The changes are still unsaved, so I will save before marking the goals finished.</planning>
<log>Save order 1042's address settings.</log>
${buildActionOutputExample(createSampleTapAction('Save button in order 1042 address settings'), { locatePromptSpec, locateResultExampleIndex: 5, buildActionOutput: actionOutputProtocol.buildActionOutput })}

#### Turn 4
**Screenshot after Save:** Editor closed; order summary shows "Saved", Shipping: "12 River Road", Billing: "8 King Street".
**Response:**
${prefix ? `${prefix}\n` : ''}<planning>The saved summary confirms the correct shipping address and unchanged billing. Both requirements are met.</planning>
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
  <sub-goal index="2" status="finished" />
</mark-sub-goal-done>
<complete success="true">12 River Road</complete>

### 3. Other endings

**Cannot accomplish:** User requests changing workspace ID 'team-red' to 'team-blue'; settings explicitly say workspace IDs are permanent.
**Response:**
${prefix ? `${prefix}\n` : ''}<planning>The requested ID differs from the current one, but the settings explicitly prohibit changing it.</planning>
<complete success="false">The workspace ID cannot be changed after creation.</complete>

**Persistent error:** User requests opening Reports; four attempts, including reload and reopening from navigation, produced the same server error.
**Response:**
${prefix ? `${prefix}\n` : ''}<planning>The same server error persists after four attempts, including recovery actions.</planning>
<error>Unable to open Reports because the server error persists.</error>`;
