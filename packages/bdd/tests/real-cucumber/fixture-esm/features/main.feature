Feature: ESM project smoke

  Scenario: An ESM-registered no-ai callback executes
    Given I open the demo shop
    # @no-ai
    Then the esm marker step writes "ESM_MARKER"
