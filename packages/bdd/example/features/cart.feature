# Calls both shared flows declaratively (see features/flows/), then inspects
# the cart. <price> is the runtime variable returned by the add-to-cart flow.
Feature: Cart inspection

  Scenario: Cart shows quantity controls and the correct total
    Given I am logged in as "guest"
    And I have added "Camp Mug" to the cart
    When I open the cart page
    Then the cart line item shows quantity controls to increase and decrease the quantity
    And the cart total equals <price>
