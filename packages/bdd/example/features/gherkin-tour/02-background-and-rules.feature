# Background and Rule — structure WITHIN a feature.
@tour
Feature: Gherkin tour — Background and Rules
  A `Background:` lists steps that run before EACH scenario in its scope; a
  `Rule:` groups related scenarios under one business rule and may carry its
  own (additional) Background. Tags on a Rule are inherited by every
  scenario inside it, exactly like feature tags.

  # This feature-level Background runs first in every scenario below,
  # including the ones nested inside the Rule.
  Background:
    Given I open the demo shop home page

  # A Rule header, with its own description prose and a rule-level tag.
  # Run only this rule's scenarios with `--tags @coupons`.
  @coupons
  Rule: The SAVE10 coupon grants a 10% discount
    Coupons are entered on the cart page. Only SAVE10 is valid in the demo.

    # A Rule-level Background: its steps run AFTER the feature Background,
    # before each scenario in this Rule only.
    Background:
      Given I have added "Trail Backpack" to the cart

    # `Example:` is the modern synonym for `Scenario:` — both spellings are
    # interchangeable and declare ONE concrete scenario; no variables are
    # involved. Don't confuse it with `Examples:` (plural), which only appears
    # under a `Scenario Outline:` and holds the value table for its
    # `<placeholders>` — see 03-scenario-outlines.feature.
    Example: Applying SAVE10 confirms and discounts the total
      When I enter the coupon code "SAVE10" and click Apply
      Then a "Coupon applied" message is visible
      And the cart total equals $116.10, a 10% discount off the $129.00 unit price

    Scenario: An unknown coupon is rejected with an error toast
      When I enter the coupon code "SAVE99" and click Apply
      Then an error toast mentioning the unknown coupon code "SAVE99" is visible
