#!/usr/bin/env node
/**
 * Deterministic synthetic suite for dashboard scale testing.
 *
 *   node scripts/gen-scale-fixture.mjs <outDir>
 *
 * Writes a midscene.config.ts (factory stub — never runnable, only loadable),
 * 12 shared flows (3 of which call other flows, i.e. depth-2 chains),
 * 30 feature files x 4-6 scenarios (~150 scenarios) that call 1-3 flows
 * each, captures + <var> uses, step annotations, two Scenario Outlines, and
 * seeded imperfections so the HEALTH panel has content:
 *   - 2 unused flows
 *   - 1 unknown-var use
 *   - 1 malformed remember statement
 *   - 1 $missing-skill reference
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

// Flow call depth: leaf flows are depth 1; "composed" flows below call
// other flows (depth 2 = MAX_FLOW_DEPTH, intentionally legal).
const CORE_FLOWS = `Feature: Shared core flows

  @flow @param:role @returns:greeting
  Scenario: I am signed in as {string}
    When I open the sign-in page
    And I enter the "<role>" credentials
    And I remember the greeting banner text as "greeting"
    Then the "<role>" workspace is visible

  @flow @param:product @returns:price
  Scenario: I have added {string} to the basket
    When I open the product listing
    And I remember the price of the "<product>" tile as "price"
    And I add the "<product>" tile to the basket
    Then the basket badge increments

  @flow @param:coupon @returns:discount
  Scenario: I have applied the coupon {string}
    When I open the basket panel
    And I enter the coupon code "<coupon>" and press apply
    And I remember the discount line value as "discount"
    Then the discount line is visible

  @flow @param:section
  Scenario: I have opened the {string} section
    When I open the navigation drawer
    And I click the "<section>" entry
    Then the "<section>" heading is visible

  @flow @param:term @returns:resultCount
  Scenario: I have searched the catalog for {string}
    When I focus the search box
    And I type "<term>" and press enter
    And I remember the result counter as "resultCount"
    Then the result list is visible

  @flow @param:locale
  Scenario: I have switched the locale to {string}
    When I open the preferences menu
    And I pick the "<locale>" locale
    Then the interface language changes

  @flow @returns:invoiceNumber
  Scenario: I have archived the oldest invoice
    When I open the invoices table
    And I remember the first invoice number as "invoiceNumber"
    And I click archive on the first invoice row
    Then the archived banner is visible

  @flow
  Scenario: I have exported the audit report
    When I open the reports page
    And I click the export button
    Then the download toast appears

  @flow
  Scenario: I have reset the sandbox environment
    When I open the developer settings
    And I click the reset sandbox button
    Then the sandbox status shows fresh
`;

const COMPOSED_FLOWS = `Feature: Shared composed flows

  @flow @param:role @returns:receipt
  Scenario: I have completed checkout as {string}
    Given I am signed in as "<role>"
    And I have added "Sample Kit" to the basket
    When I open the payment page
    And I remember the receipt number as "receipt"
    Then the order confirmation for the "<role>" account is visible

  @flow @param:customer @returns:orderId
  Scenario: I have created a draft order for {string}
    Given I am signed in as "agent"
    When I start a new order for the "<customer>" account
    And I remember the draft order number as "orderId"
    Then the draft badge is visible

  @flow @param:product @returns:price
  Scenario: I have prepared a reviewed cart for {string}
    Given I have added "<product>" to the basket
    When I open the basket review page
    Then the "<product>" line item has a review checkmark
`;

writeFileSync(join(base, 'features', 'flows', 'core.feature'), CORE_FLOWS);
writeFileSync(
  join(base, 'features', 'flows', 'composed.feature'),
  COMPOSED_FLOWS,
);

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
// Together they exercise 1-3 flow calls, captures + <var> uses, data
// tables, and @soft / # @agent / # @no-ai annotations.
const TEMPLATES = [
  (n) => [
    `  Scenario: Basket total reflects the ${pick(PRODUCTS, n)} price`,
    `    Given I am signed in as "${pick(ROLES, n)}"`,
    `    And I have added "${pick(PRODUCTS, n)}" to the basket`,
    '    When I open the basket panel',
    '    Then the basket total equals <price>',
  ],
  (n) => [
    '  @soft',
    `  Scenario: Coupon ${pick(COUPONS, n)} discount banner`,
    `    Given I am signed in as "${pick(ROLES, n + 1)}"`,
    `    And I have applied the coupon "${pick(COUPONS, n)}"`,
    '    Then the discount banner shows <discount>',
  ],
  (n) => [
    `  Scenario: Search for ${pick(TERMS, n)} shows a counter`,
    `    Given I have searched the catalog for "${pick(TERMS, n)}"`,
    '    # @no-ai',
    '    Then the result counter equals <resultCount>',
  ],
  (n) => [
    `  Scenario: Visiting the ${pick(SECTIONS, n)} section is logged`,
    `    Given I have opened the "${pick(SECTIONS, n)}" section`,
    '    # @agent',
    '    Then the server log notes the visit, per $check-logs',
  ],
  (n) => [
    `  Scenario: Checkout receipt for ${pick(ROLES, n)} appears in history`,
    `    Given I am signed in as "${pick(ROLES, n)}"`,
    `    And I have switched the locale to "en-GB"`,
    `    And I have completed checkout as "${pick(ROLES, n)}"`,
    '    Then the receipt <receipt> is shown in the order history',
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
    '    Then the draft <orderId> is listed on top',
  ],
  (n) => [
    `  Scenario: Reviewed cart keeps the ${pick(PRODUCTS, n + 2)} price`,
    `    Given I have prepared a reviewed cart for "${pick(PRODUCTS, n + 2)}"`,
    '    And I remember the basket subtotal as "subtotal"',
    '    Then the subtotal <subtotal> is not less than <price>',
  ],
  () => [
    '  Scenario: Archiving an invoice updates the archive list',
    '    Given I have archived the oldest invoice',
    '    When I open the archive tab',
    '    Then the invoice <invoiceNumber> appears in the archive list',
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

// Seeded imperfections, placed at fixed (file, scenario) coordinates.
const SEEDED = {
  unknownVar: [
    '  Scenario: Session banner shows a token (seeded unknown-var)',
    '    Given I am signed in as "guest"',
    '    Then the header shows the <sessionToken> badge',
  ],
  malformedRemember: [
    '  Scenario: Invoice number capture (seeded malformed remember)',
    '    Given I have archived the oldest invoice',
    '    When I remember the archive banner text as "invoice-number"',
    '    Then the archive tab is still open',
  ],
  missingSkill: [
    '  Scenario: Audit trail is appended (seeded missing skill)',
    `    Given I have opened the "billing" section`,
    '    # @agent',
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
    else if (f === 7 && s === 1) blocks.push(SEEDED.unknownVar.join('\n'));
    else if (f === 12 && s === 2)
      blocks.push(SEEDED.malformedRemember.join('\n'));
    else if (f === 21 && s === 1) blocks.push(SEEDED.missingSkill.join('\n'));
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
  writeFileSync(
    join(base, 'features', `suite-${fileNo}-${domain}.feature`),
    body,
  );
}

console.log(
  `Wrote scale fixture to ${base}: 30 feature files, ${scenarioTotal} scenarios, 12 flows (2 unused), seeded health findings.`,
);
