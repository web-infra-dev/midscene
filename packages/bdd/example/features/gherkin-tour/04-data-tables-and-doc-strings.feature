# Data Tables and Doc Strings — attaching structured data to a single step.
@tour
Feature: Gherkin tour — Data Tables and Doc Strings

  # A Data Table is the block of `| cells |` indented under a step. It is
  # passed to the step as an argument (classic Cucumber hands it to your
  # step definition; this framework appends it to the AI prompt verbatim).
  Scenario: A data table describes a whole shopping list in one step
    Given I open the demo shop home page
    When I add the following products to the cart, with the listed quantity of each
      | product        | quantity |
      | Camp Mug       | 2        |
      | Trail Backpack | 1        |
    Then the cart total equals $178.00

  # A Doc String is the free-form text between `"""` fences under a step —
  # use it for multi-line content a one-line step can't hold. An optional
  # content type may follow the opening fence (e.g. """markdown); Cucumber
  # passes it through as metadata. Triple backticks (```) work as an
  # alternative fence, handy when the text itself contains quotes.
  Scenario: Doc strings carry multi-line text into a step
    Given I open the notes page of the demo shop
    When I type the following text into the new-note box and save the note
      """markdown
      Restock plan:
      - Trail Backpack arrives Friday
      - Camp Mug is selling fast
      """
    And I type the following text into the new-note box and save the note
      ```
      Second note, written between backtick fences.
      ```
    Then the saved notes list contains 2 notes, the first mentioning "Restock plan"
