/**
 * POC: JS/TS front-end over the shared flow-IR — the exact counterpart of
 * ./shop.feature. Both compile to the same IR and run through `runScenario`.
 */
import {
  Given,
  Soft,
  Then,
  When,
  callFlow,
  createFlowRegistry,
  defineFlow,
  feature,
  remember,
  scenario,
} from '@midscene/testing-framework';

// A named flow: parameterized, fresh variable scope inside (only `role` is
// visible), and only the declared return (`greeting`) flows back to callers.
export const loginFlow = defineFlow({
  name: 'Login',
  params: ['role'],
  returns: ['greeting'],
  steps: [
    When('I open the login page'),
    When('I sign in as the "{role}" user with the saved test credentials'),
    Then('the dashboard for the "{role}" role is visible'),
    remember('the greeting message shown in the header', 'greeting'),
  ],
});

const background = Given('the demo shop is open on the home page');

export const checkoutAsAdmin = scenario('Checkout as admin', [
  background,
  callFlow('Login', { role: 'admin' }),
  When('I go back to the shop home page'),
  remember('the price of the "Trail Backpack" product', 'price'),
  When('I add the "Trail Backpack" to the cart and open the cart'),
  Then('the cart total equals {price}'),
  Then('the cart does not show any error banner'),
]);

export const promoBanner = scenario('Promo banner is advisory', [
  background,
  Soft('a promo banner is visible at the top of the page'),
]);

// Dynamic authoring: plain JS replaces Scenario Outline examples.
const roles = ['admin', 'guest'];

// Same { name, scenarios, flows } shape as the Gherkin compiler's output.
export const shopFeature = feature(
  'Checkout with a reusable login flow',
  [
    checkoutAsAdmin,
    promoBanner,
    ...roles.map((role) =>
      scenario(`Login greets every role (${role})`, [
        background,
        callFlow('Login', { role }),
        Then('the header greets the user with {greeting}'),
      ]),
    ),
  ],
  [loginFlow],
);

export const registry = createFlowRegistry(shopFeature.flows);
