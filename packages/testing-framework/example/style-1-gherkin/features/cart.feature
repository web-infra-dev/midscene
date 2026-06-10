# An independent test module. It calls the shared "Login" and "Add product
# to cart" flows (defined under ../flows) and only authors what is specific
# to cart management. Cross-file resolution is the suite's job: compile all
# .feature files with `compileSuite`, run each module's scenarios against
# the merged flow registry.
#
# Keyword → runtime mapping (no step definitions anywhere):
#   Given/When → ui action performed by the Midscene UI Agent
#   Then       → verify: a general agent must report a pass/fail verdict;
#                fail (or no verdict) FAILS the scenario (fail-closed)
#   And/But    → inherit the previous primary keyword
Feature: Cart management

  Background:
    Given the demo shop is open on the home page

  Scenario: Cart shows the added product with quantity and price
    When I run the "Login" flow with role "guest"
    # The flow's declared return {price} lands in this scenario's variable
    # table; the Then steps below use it after mechanical substitution.
    And I run the "Add product to cart" flow with product "Camp Mug"
    Then the cart lists "Camp Mug" with quantity 1 at {price}
    And the cart badge in the header shows 1 item

  Scenario: Increasing the quantity updates the total
    When I run the "Login" flow with role "guest"
    And I run the "Add product to cart" flow with product "Camp Mug"
    When I increase the "Camp Mug" quantity in the cart to 2
    Then the cart total equals twice {price}
    And the cart badge in the header shows 2 items
