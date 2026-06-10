# Smoke module: a login matrix over the shared "Login" flow. Scenario
# Outline examples are expanded at compile time by the Gherkin pickles
# compiler — "<role>" is replaced per example row. Note the two kinds of
# placeholders: "<role>" is compile-time (Gherkin examples), "{greeting}"
# is runtime (filled by the Login flow's declared return when it executes).
Feature: Login smoke

  Background:
    Given the demo shop is open on the home page

  Scenario Outline: Login greets every role
    When I run the "Login" flow with role "<role>"
    Then the header greets the user with {greeting}

    Examples:
      | role  |
      | admin |
      | guest |
