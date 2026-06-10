# Coupon journey built on the shared flows. <price> is returned by the
# add-to-cart flow; the final assertion checks the 10% discount against it.
Feature: Checkout with a coupon

  Scenario: Applying SAVE10 gives a 10% discount
    Given I am logged in as "admin"
    And I have added "Trail Backpack" to the cart
    When I open the cart page
    And I enter the coupon code "SAVE10" and click Apply
    Then a "Coupon applied" message is visible
    And the cart total equals <price> minus a 10% discount
