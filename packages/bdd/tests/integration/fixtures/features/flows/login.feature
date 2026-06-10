Feature: Reusable login flow

  @flow @param:role @returns:greeting
  Scenario: I am logged in as {string}
    Given I open the login page
    When I sign in with the "<role>" account
    Then the dashboard is visible
    And I remember the greeting banner text as "greeting"
