# A "flow" is a reusable step definition authored in Gherkin:
# - The scenario NAME is a cucumber expression. Callers invoke it declaratively,
#   e.g. `Given I am logged in as "guest"`.
# - `@param:role` binds the expression's {string} capture to the `<role>`
#   placeholder inside the flow body — the same `<x>` substitution semantics
#   as a Scenario Outline, scoped to this flow.
# - Steps inside a flow run through the Midscene UI agent by default.
Feature: Shared login flow

  @flow @param:role
  Scenario: I am logged in as {string}
    When I open the login page
    And I sign in as the "<role>" user with the demo password shown on the login form
    Then the dashboard for the "<role>" role is visible
