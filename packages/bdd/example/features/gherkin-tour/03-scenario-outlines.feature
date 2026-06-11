# Scenario Outline — run the same scenario once per Examples row.
@tour
Feature: Gherkin tour — Scenario Outlines
  An outline's steps may contain `<placeholders>`. Gherkin substitutes them
  at COMPILE time from each `Examples:` row, producing one concrete scenario
  per row. The same `<x>` substitution is reused for this framework's @flow
  scenarios, bound from their `@param:` declarations (see features/flows/) —
  and that is the ONLY variable mechanism here: there is deliberately no
  runtime capture/remember syntax.

  # Multiple Examples tables are allowed, each optionally named, described,
  # and tagged. Tags on an Examples block apply only to the scenarios
  # generated from THAT table: `--tags @guest-only` runs just the second row
  # set here.
  #
  # Placeholders also work in the Scenario Outline NAME: `<role>` below makes
  # each generated scenario render as `The "admin" role can log in`, then
  # `The "guest" role can log in` — which is how reports tell rows apart.
  #
  # `Given I am logged in as "<role>"` becomes e.g. `... as "admin"`, which
  # then matches the reusable flow defined in features/flows/login.feature.
  Scenario Outline: The "<role>" role can log in
    Given I am logged in as "<role>"
    Then the dashboard for the "<role>" role is visible

    # Mind the naming trap: `Examples:` (plural) is THIS keyword — the table
    # of values feeding an outline's `<placeholders>`. It is unrelated to
    # `Example:` (singular), a synonym of `Scenario:` that declares one
    # concrete scenario with no variables (see 02-background-and-rules.feature).
    Examples: built-in administrator roles
      | role  |
      | admin |

    @guest-only
    Examples: visitor roles
      | role  |
      | guest |

  # Substitution is not limited to step text. Gherkin also replaces
  # `<placeholders>` inside the multiline step arguments — Data Table cells
  # and Doc String content — attached to an outline's steps.
  Scenario Outline: Restocking <quantity> x <product> leaves a note
    Given I open the demo shop home page
    When I add the following products to the cart, with the listed quantity of each
      | product   | quantity   |
      | <product> | <quantity> |
    Then the cart total equals <line total>
    When I open the notes page of the demo shop
    And I type the following text into the new-note box and save the note
      """
      Restock reminder: we sold <quantity> x <product> today.
      """
    Then the saved notes list contains a note mentioning "<product>"

    Examples:
      | product        | quantity | line total |
      | Camp Mug       | 2        | $49.00     |
      | Trail Backpack | 1        | $129.00    |

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
