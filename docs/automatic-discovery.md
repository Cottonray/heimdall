# AI scenario discovery and execution

A project dashboard can discover test scenarios from its configured source excerpts and the initial observed UI, then execute the proposed cases sequentially. Android uses the project's package through Appium; mobile web uses the supplied allowed URL. Existing authentication and device reservation rules apply.

1. Select the environment and choose **발견**. The configured model returns up to 12 distinct cases with goals and expected results. This is an execution budget, not a coverage claim. Source is bounded; neither full repository analysis nor exhaustive UI exploration is implied.
2. Inspect the proposals, then choose **일괄 실행**. The AI chooses each action from the observed UI. Each case creates an ordinary saved test session and screenshot evidence. A successful assertion is required before a case can pass.
3. Watch discovered, passed and attention counts, actual assertions, AI/human action counts and evidence. **실행 기록** opens the existing session UI for review or human correction. A case requiring intervention does not become a pass automatically.
4. **중지** preserves completed results and queued cases. Starting again continues queued cases; after all cases have outcomes, **재검증** creates a separate campaign and fresh sessions with the same goals. Earlier campaign rows and test sessions remain in storage.

Each case has at most three 12-action agent rounds. Only the explicit action-budget pause continues automatically; ambiguity, failures and human requests remain attention results. A server restart interrupts active campaigns and preserves their evidence. The runner does not operate real financial transactions.

Campaign metadata is stored in `aiqa_campaigns`. Model output is untrusted; UI text renders as React text, and proposed actions still go through the existing action validation and engine. Android label/resource-id normalization only uses nodes in the current observation. No customer source, URLs, generated cases or operational results are committed with this feature.

Verification follows the repository policy: build the Studio and verify the requested flows against a synthetic app. Type checks, lint and test suites are not run. A passed demo run does not establish model accuracy for other applications or full feature coverage.
