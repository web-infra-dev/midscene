Feature: Real-cucumber smoke over the stub UI agent

  Scenario: Happy path with a parameterized flow call
    Given I open the demo shop
    And I am stub-logged in as "alice"
    When I add the first item to the cart
    Then the order total is shown

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
