# Scenario list after deletion

Successful bulk deletion now removes the deleted sessions from the local workspace
and status lists immediately, clears their terminal references, and closes their tabs
before fetching fresh status. Status requests started before deletion are invalidated
so their stale responses cannot restore the removed rows.

Previously, refresh only merged sessions returned by the server, leaving deleted
sessions in the local list until the browser reloaded.

Validation: Studio production build. Type checks, lint and test suites are omitted
under the repository verification policy.

Source-based scenario drafts also retain the interactive Codex terminal below
the plan. Previously, the draft-only early return hid the terminal entirely,
preventing users from discussing and refining the scenario in its saved context.
Drafts remain unexecuted; showing the terminal does not reconnect a test device.
