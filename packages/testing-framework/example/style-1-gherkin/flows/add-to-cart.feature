# A second shared flow (see login.feature for the full concept notes).
# The cart and checkout test modules both compose this with "Login" —
# neither module defines either flow. Its declared return {price} is how a
# value observed mid-flow (the product's price on the shop page) travels
# back to the calling scenario for later assertions.
Feature: Shared cart flows

  @flow @param:product @returns:price
  Scenario: Add product to cart
    When I go to the shop home page
    And I remember the price of the "{product}" product as "price"
    When I add the "{product}" to the cart and open the cart
