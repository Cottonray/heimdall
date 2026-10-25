# AI scenario discovery and execution

The campaign API can discover test scenarios from its configured source excerpts and the initial observed UI, then execute the proposed cases sequentially. Android uses the project's package through Appium; mobile web uses the supplied allowed URL. Existing authentication and device reservation rules apply.

The dashboard panel was removed at the user's request. Stored campaigns and sessions are preserved. The API workflow remains:

The campaign API retains discovery, sequential execution, stop and outcome-audit operations. Discovery reads bounded source excerpts and the initial UI and proposes at most 12 cases. This limit is a run budget, not an exhaustive coverage claim. Each run produces ordinary sessions that remain accessible through test records. No campaign controls or counters are shown on the dashboard.

A case passes only after a successful assertion and a separate review of recorded actions. Seeing expected text alone does not prove reset, refresh or another requested interaction happened. The review retains its reason and cites successful assertion step numbers. Attention is not a confirmed app defect; review can have conservative false negatives.

Explicit device launches stop Android campaigns and prevent automatic continuation from reclaiming the new holder's device. See [device handoff](device-takeover.md).

Each case has at most three 12-action agent rounds. Only the explicit action-budget pause continues automatically; ambiguity, failures and human requests remain attention results. A server restart interrupts active campaigns and preserves their evidence. The runner does not operate real financial transactions.

Campaign metadata is stored in `aiqa_campaigns`. Model output is untrusted; UI text renders as React text, and proposed actions still go through the existing action validation and engine. Android label/resource-id normalization only uses nodes in the current observation. No customer source, URLs, generated cases or operational results are committed with this feature.

Verification follows the repository policy: build the Studio and verify the requested flows against a synthetic app. Type checks, lint and test suites are not run. A passed demo run does not establish model accuracy for other applications or full feature coverage.

The outcome review can conservatively flag valid runs as attention cases (including ambiguous wording or invalid assertion references). Attention is not a confirmed application defect. The original action trace and screen evidence remain authoritative for human review.
