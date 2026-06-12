# Welcome to the Gherkin tour. These files demonstrate every construct from
# the official Gherkin reference (https://cucumber.io/docs/gherkin/reference/)
# against the demo shop, with explainers for readers new to Cucumber/BDD.
#
# Lines starting with `#` are COMMENTS — the only comment form Gherkin has,
# and they must be full lines (no end-of-line comments). Cucumber ignores
# them. This framework adds ONE documented extension on top: a comment that
# consists only of markers (`# [agent]`, `# [no-ai]`, `# [soft]`, `# $skill`)
# placed DIRECTLY above a step changes how that one step is executed — see
# features/error-reporting.feature for all three routing rules in action.
# The square brackets are deliberate: `@`-prefixed names are cucumber TAG
# syntax (like @tour below), and comment markers are not tags.
#
# The line below names the feature. Tags placed above it (like @tour) apply
# to every scenario inside; run a subset with e.g. `npx cucumber-js --tags
# @tour`. Our profile already injects `not @flow` so reusable flow scenarios
# never run standalone.
@tour
Feature: Gherkin tour — steps and comments
  Everything indented under the `Feature:` line (until the first Scenario,
  Background, or Rule) is the feature DESCRIPTION: free-form prose for human
  readers. Cucumber parses but never executes it. Descriptions are also
  allowed under Scenario, Rule, and Examples headers.

  With @midscene/bdd, the steps themselves are plain natural language: by
  default each one is sent to the Midscene vision agent, which drives the
  page (Given/When) or judges an assertion against it (Then, fail-closed).

  # `Given` describes the starting context, `When` an action, `Then` an
  # expected outcome. `And` and `But` repeat the PREVIOUS keyword — they
  # exist purely for readability, and `But` reads best for negative
  # expectations. Cucumber treats the keyword as documentation; matching
  # (here: routing) uses only the text after it.
  Scenario: Given/When/Then/And/But cover one shopping round-trip
    Given I open the demo shop home page
    When I add the "Camp Mug" product to the cart
    Then the cart shows the "Camp Mug" product
    And the cart total equals the Camp Mug unit price of $24.50
    But no "Coupon applied" message is visible

  # `*` is the bullet-list step keyword: valid anywhere Given/When/Then are.
  # Gherkin cannot infer a step type from `*`, so this framework executes
  # bullet steps as actions — prefer explicit Then for assertions.
  Scenario: The * keyword writes steps as a bullet list
    * I open the demo shop home page
    * I add the "Trail Backpack" product to the cart
    * I increase the "Trail Backpack" quantity by one using the + control in the cart
