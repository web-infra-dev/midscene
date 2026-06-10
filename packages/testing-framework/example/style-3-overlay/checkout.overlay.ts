/**
 * READ THIS FIRST (style 3: Gherkin + sparse JS overlay).
 *
 * WHAT AN OVERLAY IS: the .feature file (style 1's checkout.feature) stays
 * the human-readable source of truth — this file is a sparse JS PATCH on
 * top of it. The overlay is keyed by scenario title, and within a scenario
 * by a step anchor (the step's exact text, or its index). With it you can:
 *   - inject computed variables into a scenario's variable table (`vars`),
 *   - insert extra steps before/after an anchored step (`before`/`after`),
 *   - override an anchored step's prompt or downgrade its assertion kind
 *     (`template`, `node` — e.g. verify → soft),
 *   - skip or focus whole scenarios (`skip`/`only`).
 *
 * Everything NOT mentioned here runs as pure Gherkin: no restating of
 * steps, no parallel JS suite to keep in sync. Drift is caught at BIND
 * time — if the feature file is edited so a title or anchored step no
 * longer matches, `bindFeature` throws immediately with the closest match
 * and a ready-to-paste corrected overlay snippet (nothing silently
 * no-ops at runtime).
 *
 * Use this style when Gherkin is the shared language with non-engineers,
 * but a few scenarios need values or tweaks only code can provide.
 *
 * Flows stay shared: the bound feature defines none, so it runs against
 * the same suite registry as styles 1 and 2 (see scripts/demo/main.ts).
 */
import { join } from 'node:path';
import { bindFeature } from '@midscene/testing-framework';

// A bind-time computed value — exactly what Gherkin alone cannot express.
const couponCode = `E2E-${new Date().toISOString().slice(0, 10)}`;

export const bound = bindFeature(
  join(__dirname, '../style-1-gherkin/features/checkout.feature'),
  {
    scenarios: {
      'Checkout as admin': {
        // Injected variable: available as {couponCode} from the first step.
        vars: { couponCode },
        steps: [
          {
            // Insert a step after the shared flow call. A flow-call step is
            // anchored by its flow name.
            at: 'Add product to cart',
            after: ['apply the coupon code {couponCode} in the cart'],
          },
          {
            // Override: the coupon changes the total, so the exact-total
            // verify from the feature file is reworded and downgraded to a
            // non-gating soft check.
            at: 'the cart total equals {price}',
            node: 'soft',
            template:
              'the cart total equals {price} minus the "{couponCode}" coupon discount',
          },
        ],
      },
      // Per-scenario runner config at the IR level.
      'Promo banner is advisory': { skip: true },
    },
  },
);
