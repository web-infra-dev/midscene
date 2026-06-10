Feature: Real-cucumber smoke over the stub UI agent

  Scenario: Happy path with flow, capture and substitution
    Given I open the demo shop
    And I am stub-logged in as "alice"
    When I add the first item to the cart
    And I remember the first item price as "price"
    Then the order total equals <price>

  Scenario: Doc string step
    When I paste the following note
      """
      DOC_STRING_BODY first line
      second line
      """

  Scenario: Data table step
    When I fill the form with
      | a | b |
      | 1 | 2 |

  Scenario: Soft assertion failure stays green
    Given I open the demo shop
    # @soft
    Then the promo banner is in SOFT_FAIL state

  Scenario: No-ai marker callback
    # @no-ai
    Then the marker step writes "MARKER_42"

  @must-fail
  Scenario: Unmatched no-ai step fails with a snippet
    # @no-ai
    Then nobody ever implemented this step
