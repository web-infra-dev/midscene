# The checkout module reuses the same shared flows as cart.feature — flows
# are written once under ../flows and called everywhere. This file is also
# the binding target of style 3: ../../style-3-overlay/checkout.overlay.ts
# patches the admin journey with a computed coupon code WITHOUT this file
# changing — it stays the single human-readable source of truth.
Feature: Checkout

  Background:
    Given the demo shop is open on the home page

  Scenario: Checkout as admin
    When I run the "Login" flow with role "admin"
    And I run the "Add product to cart" flow with product "Trail Backpack"
    Then the cart total equals {price}
    But the cart does not show any error banner

  # The @soft tag downgrades this scenario's Then steps from verify to soft:
  # a failed soft check records a warning but never fails the scenario. Use
  # it for advisory checks that should not gate a run.
  @soft
  Scenario: Promo banner is advisory
    Then a promo banner is visible at the top of the page
