# A "flow" is a reusable step definition authored in Gherkin:
# - The scenario NAME is a cucumber expression. Callers invoke it declaratively,
#   e.g. `Given I am logged in as "guest"`.
# - `@param:role` binds the expression's {string} capture to the runtime
#   variable <role>. `<role>` below is midscene-bdd runtime-var syntax seeded
#   from that binding — this is NOT a Scenario Outline placeholder.
# - Steps inside a flow run through the Midscene UI agent by default.
# - `I remember ... as "greeting"` is the built-in capture step; @returns:greeting
#   copies the captured variable back into the caller's scope.
Feature: Shared login flow

  @flow @param:role @returns:greeting
  Scenario: I am logged in as {string}
    When I open the login page
    And I sign in as the "<role>" user with the correct password
    Then the dashboard for the "<role>" role is visible
    And I remember the greeting message in the header as "greeting"
