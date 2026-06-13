#!/usr/bin/env node
/**
 * Deterministic synthetic suite for dashboard scale testing.
 *
 *   node scripts/gen-scale-fixture.mjs <outDir>
 *
 * Writes a midscene.config.ts (factory stub — never runnable, only loadable),
 * 30 shared flows arranged as a realistic dependency web:
 *   - a 7-flow SaaS pipeline chain (report → run → pipeline → data source →
 *     project → workspace → signed-in), the deepest inheritance line
 *   - a 5-flow support-desk chain (archive → resolve → escalate → file →
 *     signed-in)
 *   - commerce composition (checkout/cart/coupon diamonds over add-to-basket)
 *   - heavy fan-in on "I am signed in as {string}" (9 flow callers + scenarios)
 * plus 33 feature files x ~5 scenarios (~163 scenarios) that call the flows —
 * including one fan-out smoke scenario calling 5 flows and two story-arc
 * features whose scenarios climb the pipeline/support chains level by level.
 * Flow bodies use declared <param> placeholders, step annotations
 * (# [agent] / # [no-ai] / @soft / $skill — including routed steps inside
 * two flow bodies so the graph's routing markers light up), two Scenario
 * Outlines, and seeded imperfections so the HEALTH panel has content:
 *   - 2 unused flows
 *   - 1 undeclared <placeholder> in a flow body
 *   - 1 detached "# [agent]" annotation comment (blank line before the step)
 *   - 1 tag-level @agent tag (ignored by routing)
 *   - 1 legacy "# @agent" marker (retired @-syntax, ignored by routing)
 *   - 1 $missing-skill reference
 *   - many flow-depth findings (every flow nested deeper than MAX_FLOW_DEPTH)
 *
 * Output is fully deterministic: no randomness, names are derived from
 * indices.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node scripts/gen-scale-fixture.mjs <outDir>');
  process.exit(1);
}
const base = resolve(process.cwd(), outDir);
mkdirSync(join(base, 'features', 'flows'), { recursive: true });
mkdirSync(join(base, 'features', 'skills'), { recursive: true });

// ———————————————————————————— config + skills ————————————————————————————

// No imports: the fixture has no node_modules, and loadBddConfig (jiti)
// validates the plain object shape directly. The factory throws so the
// fixture can never be executed by accident — the dashboard never calls it.
writeFileSync(
  join(base, 'midscene.config.ts'),
  `// Synthetic scale fixture for the midscene-bdd dashboard. Load-only.
export default {
  uiAgent: async () => {
    throw new Error('scale fixture is not runnable — dashboard use only');
  },
};
`,
);

writeFileSync(
  join(base, 'features', 'skills', 'check-logs.md'),
  '# check-logs\n\nInspect the demo server log file and report matching lines.\n',
);

// ———————————————————————————— shared flows ————————————————————————————

// Leaf flows (call no other flow). "I am signed in as {string}" is the
// fan-in base of the whole suite: 9 composed flows and many scenarios
// call it. The last two flows are intentionally unused (health seed), and
// the sandbox flow's <sandboxId> names no @param: (undeclared-param seed).
const CORE_FLOWS = `Feature: Shared core flows

  @flow @param:role
  Scenario: I am signed in as {string}
    When I open the sign-in page
    And I enter the "<role>" credentials
    Then the "<role>" workspace is visible

  @flow @param:product
  Scenario: I have added {string} to the basket
    When I open the product listing
    And I add the "<product>" tile to the basket
    Then the basket badge increments

  @flow @param:coupon
  Scenario: I have applied the coupon {string}
    When I open the basket panel
    And I enter the coupon code "<coupon>" and press apply
    Then the discount line is visible

  @flow @param:section
  Scenario: I have opened the {string} section
    When I open the navigation drawer
    And I click the "<section>" entry
    Then the "<section>" heading is visible

  @flow @param:term
  Scenario: I have searched the catalog for {string}
    When I focus the search box
    And I type "<term>" and press enter
    Then the result list is visible

  @flow @param:locale
  Scenario: I have switched the locale to {string}
    When I open the preferences menu
    And I pick the "<locale>" locale
    Then the interface language changes

  @flow
  Scenario: I have archived the oldest invoice
    When I open the invoices table
    And I click archive on the first invoice row
    Then the archived banner is visible

  @flow
  Scenario: I have exported the audit report
    When I open the reports page
    And I click the export button
    Then the download toast appears
    Then the export is recorded in the server log, per $check-logs

  @flow
  Scenario: I have reset the sandbox environment
    When I open the developer settings
    And I click the reset sandbox button
    Then the sandbox status for <sandboxId> shows fresh
`;

// Commerce composition: depth-2/3 flows over the core leaves, including
// the classic diamond — "reviewed cart" and "discounted basket" both
// inherit "I have added {string} to the basket".
const COMPOSED_FLOWS = `Feature: Shared composed flows

  @flow @param:role
  Scenario: I have completed checkout as {string}
    Given I am signed in as "<role>"
    And I have added "Sample Kit" to the basket
    When I open the payment page
    Then the order confirmation for the "<role>" account is visible

  @flow @param:customer
  Scenario: I have created a draft order for {string}
    Given I am signed in as "agent"
    When I start a new order for the "<customer>" account
    Then the draft badge is visible

  @flow @param:product
  Scenario: I have prepared a reviewed cart for {string}
    Given I have added "<product>" to the basket
    When I open the basket review page
    Then the "<product>" line item has a review checkmark

  @flow @param:product
  Scenario: I have a discounted basket with {string}
    Given I have added "<product>" to the basket
    And I have applied the coupon "BUNDLE20"
    Then the basket shows the bundle discount

  @flow @param:role
  Scenario: I am signed in as {string} on the search page
    Given I am signed in as "<role>"
    And I have searched the catalog for "starter kit"
    Then the search page header shows the "<role>" avatar

  @flow @param:locale
  Scenario: I have a localized session in {string}
    Given I am signed in as "guest"
    And I have switched the locale to "<locale>"
    Then the greeting matches the "<locale>" locale
`;

// Account hygiene flows: three more direct dependents of the sign-in base
// (fan-in), one of which also inherits the "open section" leaf.
const ACCOUNT_FLOWS = `Feature: Shared account flows

  @flow
  Scenario: I have enabled two-factor auth
    Given I am signed in as "owner"
    When I open the security settings
    And I scan the enrollment QR code
    Then the two-factor badge shows enabled

  @flow
  Scenario: I have cleared the notification tray
    Given I am signed in as "manager"
    When I open the notification tray
    And I click mark-all-read
    Then the unread counter shows zero

  @flow
  Scenario: I have updated my billing address
    Given I am signed in as "admin"
    And I have opened the "billing" section
    When I edit the billing address form
    Then the saved-address toast appears
`;

// The SaaS pipeline chain — the deepest inheritance line in the fixture:
//   exported run report → completed run → configured pipeline →
//   connected data source → seeded project → active workspace → signed in
// (7 nested flows; every link is a real Given). "invited a teammate" forms
// a diamond with "seeded project" over the shared "active workspace" base.
const PLATFORM_FLOWS = `Feature: Shared platform flows

  @flow
  Scenario: I have an active workspace
    Given I am signed in as "owner"
    When I open the workspace switcher
    Then the workspace status pill shows active

  @flow
  Scenario: I have invited a teammate to the workspace
    Given I have an active workspace
    When I open the members page
    Then the pending invite row is visible

  @flow
  Scenario: I have a seeded project
    Given I have an active workspace
    When I open the projects board
    And I create a project from the starter template
    Then the project card appears on the board

  @flow
  Scenario: I have connected the demo data source
    Given I have a seeded project
    When I open the data sources tab
    And I connect the bundled demo warehouse
    Then the source health indicator is green

  @flow
  Scenario: I have a configured pipeline
    Given I have connected the demo data source
    When I open the pipeline canvas
    And I add the extract, transform and publish steps
    Then the pipeline canvas shows three connected steps

  @flow
  Scenario: I have a completed pipeline run
    Given I have a configured pipeline
    When I press run and wait for the badge to settle
    Then the run badge shows success

  @flow
  Scenario: I have an exported run report
    Given I have a completed pipeline run
    When I open the run detail page
    And I click export report
    Then the report toast links to the download
`;

// Support-desk chain: a second long inheritance line (5 nested flows
// counting the sign-in base) that ends on the same fan-in leaf.
const SUPPORT_FLOWS = `Feature: Shared support flows

  @flow
  Scenario: I have filed a support ticket
    Given I am signed in as "customer"
    When I open the help center form
    Then the ticket confirmation banner is visible

  @flow
  Scenario: I have an escalated support ticket
    Given I have filed a support ticket
    When I press the escalate button
    Then the priority chip shows urgent

  @flow
  Scenario: I have a resolved support ticket
    Given I have an escalated support ticket
    When I post the resolution note
    Then the ticket status shows resolved

  @flow
  Scenario: I have archived the resolved ticket
    Given I have a resolved support ticket
    When I open the ticket actions menu
    And I click archive ticket
    Then the ticket disappears from the open queue
    # [no-ai]
    Then the archived-ticket counter increments
`;

// Quarterly summary keeps its place as a reporting flow over checkout
// (a third independent depth-3 chain).
const DEEP_FLOWS = `Feature: Shared reporting flows

  @flow @param:role
  Scenario: I have generated a quarterly summary as {string}
    Given I have completed checkout as "<role>"
    When I open the reporting workspace
    Then the quarterly summary for the "<role>" account is listed
`;

// Every feature body also lands in featureBodies so the summary can count
// routing markers without re-reading the tree.
const featureBodies = [];
const writeFeature = (absPath, body) => {
  featureBodies.push(body);
  writeFileSync(absPath, body);
};

writeFeature(join(base, 'features', 'flows', 'core.feature'), CORE_FLOWS);
writeFeature(
  join(base, 'features', 'flows', 'composed.feature'),
  COMPOSED_FLOWS,
);
writeFeature(join(base, 'features', 'flows', 'account.feature'), ACCOUNT_FLOWS);
writeFeature(
  join(base, 'features', 'flows', 'platform.feature'),
  PLATFORM_FLOWS,
);
writeFeature(join(base, 'features', 'flows', 'support.feature'), SUPPORT_FLOWS);
writeFeature(join(base, 'features', 'flows', 'reporting.feature'), DEEP_FLOWS);

// ———————————————————————————— feature files ————————————————————————————

const DOMAINS = [
  'catalog',
  'checkout',
  'billing',
  'profile',
  'search',
  'admin',
];
const ROLES = ['guest', 'admin', 'manager', 'auditor'];
const PRODUCTS = ['Camp Mug', 'Trail Backpack', 'Field Lantern', 'Canvas Tent'];
const COUPONS = ['SAVE10', 'WELCOME5', 'BUNDLE20'];
const TERMS = ['lantern', 'mug', 'tent poles', 'rainfly'];
const SECTIONS = ['billing', 'orders', 'team', 'integrations'];
const PLANS = ['basic', 'pro', 'enterprise'];

const pick = (arr, n) => arr[n % arr.length];

// Scenario templates: each returns gherkin lines for scenario index n.
// Together they exercise 1-5 flow calls, deep-chain entry points at every
// level, data tables, and @soft / # [agent] / # [no-ai] annotations.
const TEMPLATES = [
  (n) => [
    `  Scenario: Basket total reflects the ${pick(PRODUCTS, n)} price`,
    `    Given I am signed in as "${pick(ROLES, n)}"`,
    `    And I have added "${pick(PRODUCTS, n)}" to the basket`,
    '    When I open the basket panel',
    `    Then the basket total matches the ${pick(PRODUCTS, n)} price`,
  ],
  (n) => [
    '  @soft',
    `  Scenario: Coupon ${pick(COUPONS, n)} discount banner`,
    `    Given I am signed in as "${pick(ROLES, n + 1)}"`,
    `    And I have applied the coupon "${pick(COUPONS, n)}"`,
    `    Then the discount banner mentions ${pick(COUPONS, n)}`,
  ],
  (n) => [
    `  Scenario: Search for ${pick(TERMS, n)} shows a counter`,
    `    Given I have searched the catalog for "${pick(TERMS, n)}"`,
    '    # [no-ai]',
    '    Then the result counter matches the visible list length',
  ],
  (n) => [
    `  Scenario: Visiting the ${pick(SECTIONS, n)} section is logged`,
    `    Given I have opened the "${pick(SECTIONS, n)}" section`,
    '    # [agent]',
    '    Then the server log notes the visit, per $check-logs',
  ],
  (n) => [
    `  Scenario: Checkout receipt for ${pick(ROLES, n)} appears in history`,
    `    Given I am signed in as "${pick(ROLES, n)}"`,
    `    And I have switched the locale to "en-GB"`,
    `    And I have completed checkout as "${pick(ROLES, n)}"`,
    '    Then the newest receipt is shown in the order history',
  ],
  (n) => [
    `  Scenario: Plan comparison highlights ${pick(PLANS, n)}`,
    `    Given I am signed in as "guest"`,
    '    When I review the plan options',
    '      | plan       | monthly |',
    '      | basic      | 10      |',
    '      | pro        | 25      |',
    '      | enterprise | 90      |',
    `    Then the "${pick(PLANS, n)}" plan is highlighted as recommended`,
  ],
  (n) => [
    `  Scenario: Draft order for customer-${(n % 9) + 1} gets a number`,
    `    Given I have created a draft order for "customer-${(n % 9) + 1}"`,
    '    When I open the drafts list',
    '    Then the new draft order is listed on top',
  ],
  (n) => [
    `  Scenario: Reviewed cart keeps the ${pick(PRODUCTS, n + 2)} price`,
    `    Given I have prepared a reviewed cart for "${pick(PRODUCTS, n + 2)}"`,
    '    When I open the basket review page',
    `    Then the subtotal is not less than the ${pick(PRODUCTS, n + 2)} price`,
  ],
  () => [
    '  Scenario: Archiving an invoice updates the archive list',
    '    Given I have archived the oldest invoice',
    '    When I open the archive tab',
    '    Then the archived invoice appears in the archive list',
  ],
  (n) => [
    `  Scenario: Bundle discount applies to the ${pick(PRODUCTS, n)} basket`,
    `    Given I have a discounted basket with "${pick(PRODUCTS, n)}"`,
    '    When I open the basket panel',
    '    Then the bundle savings line is visible',
  ],
  (n) => [
    `  Scenario: Localized greeting for ${pick(ROLES, n)} sessions`,
    `    Given I have a localized session in "de-DE"`,
    '    Then the welcome banner is shown in German',
  ],
  (n) => [
    `  Scenario: Search avatar appears for ${pick(ROLES, n)}`,
    `    Given I am signed in as "${pick(ROLES, n)}" on the search page`,
    '    Then the result counter is visible next to the avatar',
  ],
  () => [
    '  Scenario: Quarterly summary is generated (deep chain)',
    '    Given I have generated a quarterly summary as "manager"',
    '    Then the summary is downloadable from the reporting workspace',
  ],
  () => [
    '  Scenario: Two-factor enrollment survives a re-login',
    '    Given I have enabled two-factor auth',
    '    When I sign out and back in',
    '    Then the two-factor badge is still enabled',
  ],
  (n) => [
    `  Scenario: Notification tray stays empty for ${pick(ROLES, n)}`,
    '    Given I have cleared the notification tray',
    '    When I refresh the dashboard',
    '    Then the unread counter still shows zero',
  ],
  () => [
    '  Scenario: Billing profile is echoed on the invoice footer',
    '    Given I have updated my billing address',
    '    When I open the latest invoice',
    '    Then the footer shows the saved billing profile',
  ],
  () => [
    '  Scenario: Pipeline run badge links to the run log (deep chain)',
    '    Given I have a completed pipeline run',
    '    When I open the run log panel',
    '    Then the log header mentions the finished run',
  ],
  () => [
    '  Scenario: Exported report link resolves (deepest chain)',
    '    Given I have an exported run report',
    '    Then the report link downloads a fresh report',
  ],
  () => [
    '  Scenario: Escalated ticket shows the urgent chip',
    '    Given I have an escalated support ticket',
    '    When I reload the ticket page',
    '    Then the ticket still shows the urgent chip',
  ],
];

const OUTLINE = [
  '  Scenario Outline: The "<role>" role sees its workspace',
  '    Given I am signed in as "<role>"',
  '    Then the workspace header mentions the "<role>" role',
  '',
  '    Examples:',
  '      | role    |',
  '      | admin   |',
  '      | guest   |',
  '      | auditor |',
];

// Seeded imperfections, placed at fixed (file, scenario) coordinates. The
// detached annotation has a blank line between the marker comment and its
// step (so it never attaches); the tag-level @agent is silently ignored by
// routing (only "# [agent]" comments route); the legacy annotation uses the
// retired "# @agent" syntax, which no longer routes either.
const SEEDED = {
  detachedAnnotation: [
    '  Scenario: Audit visit is reported (seeded detached annotation)',
    '    Given I have opened the "billing" section',
    '    # [agent]',
    '',
    '    Then the server log notes the visit, per $check-logs',
  ],
  tagLevelAgent: [
    '  @agent',
    '  Scenario: Session report is appended (seeded tag-level @agent)',
    '    Given I am signed in as "auditor"',
    '    Then the session report lists the sign-in',
  ],
  legacyAnnotation: [
    '  Scenario: Sign-in audit is appended (seeded legacy @-marker)',
    '    Given I am signed in as "manager"',
    '    # @agent',
    '    Then the audit log notes the sign-in, per $check-logs',
  ],
  missingSkill: [
    '  Scenario: Audit trail is appended (seeded missing skill)',
    `    Given I have opened the "billing" section`,
    '    # [agent]',
    '    Then the audit trail records the visit, per $audit-trail',
  ],
};

let scenarioTotal = 0;
for (let f = 0; f < 30; f++) {
  const domain = pick(DOMAINS, f);
  const fileNo = String(f + 1).padStart(2, '0');
  const count = 4 + (f % 3); // 4,5,6 repeating -> 150 scenarios over 30 files
  const blocks = [];
  for (let s = 0; s < count; s++) {
    const n = f * 7 + s; // deterministic variety
    if (f === 3 && s === 0) blocks.push(OUTLINE.join('\n'));
    else if (f === 17 && s === 0) blocks.push(OUTLINE.join('\n'));
    else if (f === 7 && s === 1)
      blocks.push(SEEDED.detachedAnnotation.join('\n'));
    else if (f === 12 && s === 2) blocks.push(SEEDED.tagLevelAgent.join('\n'));
    else if (f === 21 && s === 1) blocks.push(SEEDED.missingSkill.join('\n'));
    else if (f === 26 && s === 2)
      blocks.push(SEEDED.legacyAnnotation.join('\n'));
    else blocks.push(TEMPLATES[n % TEMPLATES.length](n).join('\n'));
    scenarioTotal++;
  }
  const body = [
    `Feature: Suite ${fileNo} — ${domain}`,
    `  Synthetic ${domain} journeys generated for dashboard scale testing.`,
    '',
    blocks.join('\n\n'),
    '',
  ].join('\n');
  writeFeature(
    join(base, 'features', `suite-${fileNo}-${domain}.feature`),
    body,
  );
}

// ——————————————————— handcrafted story-arc features ———————————————————

// Fan-out: one scenario that directly orchestrates five flows.
const SMOKE_FEATURE = `Feature: Suite 31 — storefront smoke
  One wide scenario that fans out across five shared flows, plus a
  narrower companion.

  @smoke
  Scenario: Full storefront smoke pass
    Given I am signed in as "manager"
    And I have switched the locale to "en-GB"
    And I have added "Trail Backpack" to the basket
    And I have applied the coupon "SAVE10"
    And I have opened the "orders" section
    Then the basket total reflects the coupon discount

  Scenario: Smoke pass leaves no notifications behind
    Given I have cleared the notification tray
    And I have opened the "team" section
    Then the unread counter still shows zero
`;

// Story arc: SaaS onboarding → setup → operation → reporting. Each
// scenario enters the pipeline chain one level deeper, so the graph
// shows the same chain lighting up column by column.
const PIPELINE_FEATURE = `Feature: Suite 32 — pipeline lifecycle
  A SaaS story arc that climbs the platform chain level by level:
  workspace, teammate, project, data source, pipeline, run, report.

  Scenario: Workspace appears in the switcher
    Given I have an active workspace
    Then the switcher lists the active workspace first

  Scenario: Invited teammate shows as pending
    Given I have invited a teammate to the workspace
    Then the members table lists the invite as pending

  Scenario: Seeded project lands on the board
    Given I have a seeded project
    Then the board card links to the new project

  Scenario: Demo data source reports healthy
    Given I have connected the demo data source
    Then the health panel shows the demo warehouse as green

  Scenario: Configured pipeline validates cleanly
    Given I have a configured pipeline
    When I press validate
    Then the validation toast names the pipeline

  Scenario: Completed run is listed in history
    Given I have a completed pipeline run
    Then the history table lists the finished run on top

  Scenario: Exported report is downloadable end to end
    Given I have an exported run report
    Then the report link serves a fresh report
`;

const SUPPORT_FEATURE = `Feature: Suite 33 — support desk
  The support-desk arc: file, escalate, resolve, archive.

  Scenario: Fresh ticket is acknowledged
    Given I have filed a support ticket
    Then the confirmation mentions the new ticket

  Scenario: Escalation pings the on-call channel
    Given I have an escalated support ticket
    # [agent]
    Then the on-call channel mentions the ticket, per $check-logs

  Scenario: Resolution note is shown to the customer
    Given I have a resolved support ticket
    Then the customer view shows the resolution note

  Scenario: Archived ticket leaves the queue clean
    Given I have archived the resolved ticket
    When I open the open-tickets queue
    Then the queue empty-state is visible
`;

const ARC_FEATURES = [
  ['suite-31-smoke.feature', SMOKE_FEATURE, 2],
  ['suite-32-pipeline.feature', PIPELINE_FEATURE, 7],
  ['suite-33-support.feature', SUPPORT_FEATURE, 4],
];
for (const [name, body, count] of ARC_FEATURES) {
  writeFeature(join(base, 'features', name), body);
  scenarioTotal += count;
}

const allContent = featureBodies.join('\n');
const countMatches = (re) => (allContent.match(re) ?? []).length;
const agentMarkers = countMatches(/^\s*# \[agent\]$/gm);
const noAiMarkers = countMatches(/^\s*# \[no-ai\]$/gm);
// Stats-only heuristic; mirrors SKILL_NAME in packages/bdd/src/annotations.ts.
const skillRefs = countMatches(/\$[A-Za-z][A-Za-z0-9_-]*/g);

console.log(
  `Wrote scale fixture to ${base}: 39 feature files (33 suites + 6 shared-flow files), ${scenarioTotal} scenarios, 30 flows (2 unused; deepest chain nests 7 flows: report → run → pipeline → data source → project → workspace → sign-in), seeded health findings (undeclared <placeholder>, detached annotation, tag-level @agent, legacy @-marker, missing $skill), routing markers: ${agentMarkers} × "# [agent]", ${noAiMarkers} × "# [no-ai]", ${skillRefs} × $skill references.`,
);
