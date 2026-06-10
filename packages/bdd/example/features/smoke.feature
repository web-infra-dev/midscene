# Standard Scenario Outline: Examples substitution happens at Gherkin compile
# time, so each row turns `"<role>"` into a quoted literal (e.g. "admin"),
# which then matches the declarative flow expression `I am logged in as {string}`
# defined in features/flows/login.feature.
Feature: Login smoke matrix

  Scenario Outline: The "<role>" role can log in
    Given I am logged in as "<role>"
    Then the dashboard for the "<role>" role is visible

    Examples:
      | role  |
      | admin |
      | guest |
