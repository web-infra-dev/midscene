Feature: Soft checks

  Scenario: soft assertion failure is downgraded to a warning
    Given I open the demo shop
    # [soft]
    Then the promo banner is in SOFT_FAIL state
