Feature: Flows and variables

  Scenario: declarative flow call, returns and capture
    Given I am logged in as "admin"
    When I remember the first item price as "price"
    Then the order total equals <price> and greets <greeting>

  Scenario: literal flow sugar
    Given I run the "I am logged in as {string}" flow with role "guest"

  Scenario: empty capture fails
    When I remember the EMPTY badge text as "missing"

  Scenario Outline: outline feeds the flow expression
    Given I am logged in as "<role>"

    Examples:
      | role  |
      | admin |
      | guest |
