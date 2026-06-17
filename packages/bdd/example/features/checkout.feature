# Coupon journey built on the shared flows. The final assertion checks the
# 10% discount against the unit price shown on the page.
Feature: Checkout with a coupon

  Scenario: Applying SAVE10 gives a 10% discount
    Given I am logged in as "admin"
    And I have added "Trail Backpack" to the cart
    When I open the cart page
    And I enter the coupon code "SAVE10" and click Apply
    Then a "Coupon applied" message is visible
    And the cart total equals $116.10, a 10% discount off the $129.00 unit price
