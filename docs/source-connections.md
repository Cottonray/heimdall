# Operator-managed source connections

Project settings retain a credential-free HTTPS URL. Operators may set
`AIQA_SOURCE_CONNECTIONS_FILE` to a JSON file readable only by the service user.
Its keys are exact project repository URLs; each value contains a transport `url`
and optionally an `authorization` header and Git branch/tag `ref`. Pin `ref` to the
deployed test target branch when its default branch differs. Store this file outside the repository,
public assets, terminal container, and exports. Use narrowly scoped read-only
credentials. An internal HTTP endpoint is allowed only through this explicit
operator mapping; user-supplied addresses still require the host allowlist and HTTPS.

Git redirects remain disabled. Authentication is passed through the child process
environment, never its command line. Errors do not contain remote output, URLs, or
credentials. Responses retain only the project's original HTTPS URL. This transport
does not add per-project user isolation: existing authenticated workspace sharing
still applies. Source excerpts are sent to the configured AI provider when analysis
starts; obtain the source owner's permission first. Never add customer repositories
or derived material to examples, source control, or build artifacts.

With Compose, set `AIQA_SOURCE_CONNECTIONS_HOST_PATH` to the operator file and
`AIQA_SOURCE_CONNECTIONS_FILE=/opt/aiqa/source-connections.json`. The service user
must be able to read it; mode 0600 and that user's ownership are recommended.
No configured file means no custom transport. Preserve these operator environment
values in the deployment environment's source of truth.

Projects may set an Android `appPackage`. New sessions launch that installed package,
observations filter its accessibility nodes, and replays/exports preserve the package
recorded for that session. Existing sessions without a package use the default app.

Synthetic web test targets can be served from `web/webapp/<sample>/` using the fixed
`index.html`, `app.css`, `app.js`, and `copy.json` filenames. These are public targets;
never deploy confidential source or data into them.

## Chat scenario workflow

Session chat first analyzes the connected source excerpts for relevant paths,
conditions and expected outcomes. Requests to create, replace or run tests then
produce a separate scenario plan before the observed-UI action loop starts.
The analysis and plan are passed to every action decision. Analysis-only and
no-interaction requests remain conversational and do not operate the device.
Replies stay concise (normally three short sentences/bullets at most); the full
internal analysis is not copied into the chat. Routine choices are resolved from
source, history and UI. Human assistance is reserved for unavailable credentials,
human-only challenges, external permission or essential unrecoverable facts.
Bounded source excerpts are not a claim of exhaustive analysis. The action loop
retains an explicit 48-step execution budget and requires a successful assertion
before reporting completion.

Chat-authored or manually edited actions now offer an explicit verification run
in the chat panel. This starts a fresh replay of the currently displayed scenario,
not its older parent. Code display, exports and replay share the execution action
snapshot, including steps not reached by a failed run. New recorded edits replace
that snapshot with the updated recorded sequence; previous run records are kept.
The confirmation is a verification run, not a claim that drafting already proved
repeatability. A failed earlier step can still prevent later steps from running.

Chat panels start compact and grow with message content up to 40% of the work
area. Manual resizing remains available and uses its own saved height. Reading
older messages no longer forces a jump when the assistant responds; a latest
message button appears when content remains below the viewport. At the bottom,
new responses remain in view automatically.

Before interaction, a separate review rewrites the proposed scenario to remove
unrelated navigation, duplicate assertions and legacy steps from another goal.
Only explicitly retained prerequisites and newly recorded actions form the current
scenario; the original step/evidence history is preserved. Each proposed action is
also checked against the reviewed goal and current UI before it can execute. Three
consecutive rejected proposals stop the run without claiming success.

A structured checklist is stored inside an assistant message: source analysis,
planning, unnecessary-step review and execution verification. Completed items use
a green circular check icon; unavailable source is skipped, and failure or manual
interruption is not marked complete. Only a successful executed assertion can
complete the execution-verification item. This is model-assisted relevance review,
not a proof of a globally shortest navigation path.

Fine-grained action narration is kept under a collapsed “시나리오 작성” checklist
item instead of separate chat bubbles. The final outcome remains a normal reply.
Older checklist-associated replies are grouped for display without modifying the
stored history. Every status uses the same 20px circular boundary; running phases
use a rotating ring (respecting reduced-motion preferences). The checklist is
published before source loading so its first phase can visibly show progress.

Checklist rows share four aligned columns for the status icon, label, status text
and disclosure control. Rows have a consistent minimum height; expanded details
start beneath the label and wrap within the message bubble.
Disclosure details animate their height and opacity over 200ms, with matching
chevron rotation. Reduced-motion preferences disable these transitions; collapsed
content is inert and hidden from assistive technologies.
