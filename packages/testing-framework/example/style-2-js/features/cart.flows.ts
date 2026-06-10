/**
 * Twin of style-1-gherkin/features/cart.feature: an independent test module
 * that composes the shared Login and Add-product-to-cart flows without
 * defining either (see ../flows for the flow definitions and concept notes).
 *
 * `callFlow('Add product to cart', …)` runs the flow's steps in a fresh
 * scope and copies its declared return — {price} — back into this
 * scenario's variable table, where the Then assertions use it.
 */
import {
  Given,
  Then,
  callFlow,
  feature,
  scenario,
} from '@midscene/testing-framework';

const background = Given('the demo shop is open on the home page');

export const cartFeature = feature('Cart management', [
  scenario('Cart shows the added product with quantity and price', [
    background,
    callFlow('Login', { role: 'guest' }),
    callFlow('Add product to cart', { product: 'Camp Mug' }),
    Then('the cart lists "Camp Mug" with quantity 1 at {price}'),
    Then('the cart badge in the header shows 1 item'),
  ]),
  scenario('Increasing the quantity updates the total', [
    background,
    callFlow('Login', { role: 'guest' }),
    callFlow('Add product to cart', { product: 'Camp Mug' }),
    // A bare string is shorthand for When(...) — a plain UI action.
    'I increase the "Camp Mug" quantity in the cart to 2',
    Then('the cart total equals twice {price}'),
    Then('the cart badge in the header shows 2 items'),
  ]),
]);
