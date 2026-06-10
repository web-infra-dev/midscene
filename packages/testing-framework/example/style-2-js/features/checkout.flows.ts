/**
 * Twin of style-1-gherkin/features/checkout.feature, reusing the same
 * shared flows as the cart module (imported, not defined — see ../flows).
 * `Soft(...)` is the JS spelling of the @soft tag: the check warns on
 * failure but never fails the scenario.
 */
import {
  Given,
  Soft,
  Then,
  callFlow,
  feature,
  scenario,
} from '@midscene/testing-framework';

const background = Given('the demo shop is open on the home page');

export const checkoutFeature = feature('Checkout', [
  scenario('Checkout as admin', [
    background,
    callFlow('Login', { role: 'admin' }),
    callFlow('Add product to cart', { product: 'Trail Backpack' }),
    Then('the cart total equals {price}'),
    Then('the cart does not show any error banner'),
  ]),
  scenario('Promo banner is advisory', [
    background,
    Soft('a promo banner is visible at the top of the page'),
  ]),
]);
