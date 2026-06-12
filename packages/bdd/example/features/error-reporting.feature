# Showcase of the three routing rules:
# 1. Default — steps run through the Midscene UI agent (vision model drives
#    and asserts against the live page).
# 2. `# [agent]` — the single statement below the comment bails out to a
#    general coding agent, which can read files, run commands, and must
#    return a pass/fail verdict for Then steps. Adding a `$skill` token
#    (e.g. `$check-logs`) also routes to the agent and loads the named
#    skill from features/skills/ into its prompt.
# 3. `# [no-ai]` — the statement must match a classic callback registered with
#    Given/When/Then/defineStep (see features/step_definitions/).
Feature: Failed login reporting

  Scenario: Failed login is reported everywhere
    Given I open the login page of the demo shop
    When I try to sign in as the "admin" user with a wrong password
    Then an error toast shows on the screen
    # [agent]
    Then the demo app source in demo-app/index.html counts failed sign-ins in a window.__loginAttempts counter
    # [agent]
    Then the server log contains a failed-login warning, per $check-logs
    # [no-ai]
    Then the login attempt counter increments
