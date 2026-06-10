/**
 * Twin of style-1-gherkin/features/smoke.feature. Where Gherkin needs a
 * Scenario Outline + Examples table, plain JS just maps over the data —
 * dynamic authoring (loops, conditionals, computed prompts) is the main
 * reason to pick this style.
 */
import {
  Given,
  Then,
  callFlow,
  feature,
  scenario,
} from '@midscene/testing-framework';

const background = Given('the demo shop is open on the home page');

const roles = ['admin', 'guest'];

export const smokeFeature = feature(
  'Login smoke',
  roles.map((role) =>
    scenario('Login greets every role', [
      background,
      callFlow('Login', { role }),
      Then('the header greets the user with {greeting}'),
    ]),
  ),
);
