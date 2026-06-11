# Scenario Outline — run the same scenario once per Examples row.
@tour
Feature: Gherkin tour — Scenario Outlines
  An outline's steps may contain `<placeholders>`. Gherkin substitutes them
  at COMPILE time from each `Examples:` row, producing one concrete scenario
  per row. (Inside reusable @flow scenarios this framework reuses the same
  `<x>` visual for `@param:` values — see features/flows/.)

  # Multiple Examples tables are allowed, each optionally named, described,
  # and tagged. Tags on an Examples block apply only to the scenarios
  # generated from THAT table: `--tags @guest-only` runs just the second row
  # set here.
  #
  # `Given I am logged in as "<role>"` becomes e.g. `... as "admin"`, which
  # then matches the reusable flow defined in features/flows/login.feature.
  Scenario Outline: The "<role>" role can log in
    Given I am logged in as "<role>"
    Then the dashboard for the "<role>" role is visible

    Examples: built-in administrator roles
      | role  |
      | admin |

    @guest-only
    Examples: visitor roles
      | role  |
      | guest |

  # `Scenario Template:` is a synonym for `Scenario Outline:`, and
  # `Scenarios:` is a synonym for `Examples:` — shown once for completeness.
  Scenario Template: Adding <product> twice doubles the line total
    Given I open the demo shop home page
    When I add the "<product>" product to the cart
    And I increase the "<product>" quantity by one using the + control in the cart
    Then the cart total equals <doubled total>

    Scenarios:
      | product  | doubled total |
      | Camp Mug | $49.00        |
