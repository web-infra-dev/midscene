Feature: Default UI route

  Scenario: happy path acts then asserts
    Given I open the demo shop
    When I add the first item to the cart
    Then the cart badge shows 1

  Scenario: failing assertion
    Given I open the demo shop
    Then the page shows the FAIL_ME banner
