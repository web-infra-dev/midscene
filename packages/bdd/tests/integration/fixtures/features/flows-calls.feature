Feature: Flow calls

  Scenario: declarative flow call
    Given I am logged in as "admin"
    Then the dashboard greets the user

  Scenario: literal flow sugar
    Given I run the "I am logged in as {string}" flow with role "guest"

  Scenario Outline: outline feeds the flow expression
    Given I am logged in as "<role>"

    Examples:
      | role  |
      | admin |
      | guest |
