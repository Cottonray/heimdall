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
