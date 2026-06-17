Feature: Reusable flows

  @flow @param:role
  Scenario: I am stub-logged in as {string}
    Given I open the stub login page
    When I sign in with the "<role>" account
