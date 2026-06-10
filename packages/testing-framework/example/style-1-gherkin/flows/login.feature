# READ THIS FIRST (style 1: pure Gherkin).
#
# This suite has no step-definition code anywhere: every step is natural
# language executed by AI agents (Given/When → UI actions performed by the
# Midscene UI Agent; Then → a fail-closed verify judgment by a general
# agent). What WOULD be helper code in classic Cucumber becomes a FLOW:
# a named, parameterized, reusable prompt sequence.
#
# A Scenario tagged @flow is not a runnable test — it is registered in the
# suite-wide flow registry under its title ("Login"). Any feature file in
# the suite can call it ("I run the "Login" flow with role "admin"") without
# knowing where it is defined: `compileSuite` compiles every .feature file
# under this folder and merges all @flow definitions into one registry
# (duplicate flow names across files fail loudly).
#
# Flows are scoped like functions, not macros:
#   - @param:role     declares an argument; the flow runs in a FRESH variable
#     scope seeded only with its declared params (caller variables are not
#     visible inside).
#   - @returns:greeting declares which captured variables flow back into the
#     caller's scope when the flow finishes. Everything else is discarded.
Feature: Shared login flow

  @flow @param:role @returns:greeting
  Scenario: Login
    When I open the login page
    # "{role}" is a machine-owned variable placeholder. It is substituted
    # mechanically from the caller's arguments BEFORE the prompt reaches any
    # model — the model only ever sees the resolved text.
    And I sign in as the "{role}" user with the saved test credentials
    Then the dashboard for the "{role}" role is visible
    # "I remember … as "x"" is a CAPTURE step: the UI agent extracts the
    # value from the screen into the variable table (machine-owned, never
    # model prose). Later steps reference it as {greeting}.
    When I remember the greeting message shown in the header as "greeting"
