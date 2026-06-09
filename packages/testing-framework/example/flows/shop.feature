# POC: Gherkin front-end over the shared flow-IR.
# Compile with `compileFeatureFile(...)` and execute with `runScenario(...)`.
# The same flows + scenarios are authored in JS in ./shop.flows.ts.
Feature: Checkout with a reusable login flow

  Background:
    Given the demo shop is open on the home page

  # A named flow: registered in the FlowRegistry instead of run as a scenario.
  # Params/returns are declared as tags; "{role}" is substituted mechanically
  # from the caller's arguments before any prompt reaches the model.
  @flow @param:role @returns:greeting
  Scenario: Login
    When I open the login page
    And I sign in as the "{role}" user with the saved test credentials
    Then the dashboard for the "{role}" role is visible
    When I remember the greeting message shown in the header as "greeting"

  Scenario: Checkout as admin
    When I run the "Login" flow with role "admin"
    And I go back to the shop home page
    And I remember the price of the "Trail Backpack" product as "price"
    When I add the "Trail Backpack" to the cart and open the cart
    Then the cart total equals {price}
    But the cart does not show any error banner

  # @soft turns Then steps into soft nodes: failures warn, never gate.
  @soft
  Scenario: Promo banner is advisory
    Then a promo banner is visible at the top of the page

  # Scenario Outline examples are expanded by the Gherkin pickles compiler;
  # "<role>" is replaced per example row, while "{greeting}" stays a runtime
  # variable filled by the Login flow's declared return.
  Scenario Outline: Login greets every role
    When I run the "Login" flow with role "<role>"
    Then the header greets the user with {greeting}

    Examples:
      | role  |
      | admin |
      | guest |
