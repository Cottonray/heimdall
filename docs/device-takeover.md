# Explicit device launch replaces the current execution

An authenticated user's explicit Android test launch or remote-device launch replaces the current device execution. Device-farm links stay enabled for ready devices marked in use. Offline, unauthorized, unsupported and unknown devices remain unavailable.

The shared opening queue serializes the handoff: stop Android campaigns, cancel the legacy runner, invalidate the active session epoch, wait for its current action, close Appium, revoke previous viewer connections, then grant the new execution. Existing saved steps and evidence remain. A legacy runner that cannot stop within 15 seconds returns a cleanup error rather than allowing simultaneous input.

Automatic campaign opens and reconnection of saved sessions do not preempt the new holder. Revoked viewer sockets close with 4409, which the existing client does not automatically reconnect. Inspection helpers continue using the existing lease rather than triggering a takeover. iOS remote control revokes an existing human lease; no iOS automated runner is implemented here.

Verification policy: build Studio and exercise actual synthetic-device handoffs; do not run type checks, lint or test suites.
