Feature: Reusable login flow

  @flow @param:role
  Scenario: I am logged in as {string}
    Given I open the login page
    When I sign in with the "<role>" account
    Then the dashboard is visible
