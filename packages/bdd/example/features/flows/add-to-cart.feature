# Reusable flow: callers write `And I have added "Camp Mug" to the cart`.
# @param:product binds the {string} capture to the `<product>` placeholder
# inside the flow body (Scenario Outline semantics, scoped to the flow).
Feature: Shared add-to-cart flow

  @flow @param:product
  Scenario: I have added {string} to the cart
    When I go to the home page
    And I add the "<product>" product to the cart
    Then the cart shows the "<product>" product
