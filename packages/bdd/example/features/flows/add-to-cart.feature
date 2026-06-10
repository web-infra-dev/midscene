# Reusable flow: callers write `And I have added "Camp Mug" to the cart`.
# @param:product binds the {string} capture to the runtime variable <product>;
# @returns:price hands the remembered price back to the caller as <price>.
Feature: Shared add-to-cart flow

  @flow @param:product @returns:price
  Scenario: I have added {string} to the cart
    When I go to the home page
    And I remember the price of the "<product>" product as "price"
    And I add the "<product>" product to the cart
    Then the cart shows the "<product>" product
