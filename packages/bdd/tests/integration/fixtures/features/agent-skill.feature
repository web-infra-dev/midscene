Feature: Agent route with skills

  Scenario: skill-backed assert passes
    Then the backend logs are clean per $probe

  Scenario: skill-backed assert fails
    Then the VERDICT_FAIL condition holds per $probe

  Scenario: unknown skill token
    Then everything is fine per $nope
