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

The scenario list also includes authoring sessions with no recorded steps.
Connecting an older server to an authoring session can omit its plan metadata;
the session must remain accessible for continued Codex conversation even before
the first action is recorded. Empty execution records remain excluded.

The session header now exposes Run and removes the redundant New Test action.
The tools panel opens on Results, showing execution status, completed/total
steps, per-step errors, duration and evidence links alongside the code tab.
Run is disabled while busy or while no actions have been recorded, with an
explanation in Results. Repeated runs use the original execution source rather
than replaying only the partial steps of a failed attempt.
Validation remains the UI production build and browser inspection; no real
transaction is executed to validate this UI change.
