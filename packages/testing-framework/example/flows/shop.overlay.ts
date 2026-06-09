/**
 * POC: hybrid authoring mode — ./shop.feature stays the source of truth,
 * and this sparse overlay attaches JS only where it adds something. Every
 * scenario/step not mentioned here runs as pure Gherkin. Drift between this
 * overlay and the feature fails at bind time with a corrected starter
 * snippet in the error message (jest-cucumber style).
 */
import { join } from 'node:path';
import { bindFeature } from '@midscene/testing-framework';

// Computed at bind time — exactly the kind of value Gherkin cannot express.
const couponCode = `E2E-${new Date().toISOString().slice(0, 10)}`;

export const bound = bindFeature(join(__dirname, 'shop.feature'), {
  scenarios: {
    'Checkout as admin': {
      // (b) inject a computed variable into the scenario's variable table.
      vars: { couponCode },
      steps: [
        {
          // (c) insert an extra step that uses the injected variable.
          at: 'I add the "Trail Backpack" to the cart and open the cart',
          after: ['apply the coupon code {couponCode} in the cart'],
        },
        {
          // (a) override: the total now includes the coupon discount, so
          // downgrade the exact-total check to a non-gating soft node.
          at: 'the cart total equals {price}',
          node: 'soft',
          template:
            'the cart total equals {price} minus the "{couponCode}" coupon discount',
        },
      ],
    },
    // (d) per-scenario config at the IR level.
    'Promo banner is advisory': { skip: true },
  },
});
