# 0006 — Conversational signup and resumable bootstrap

**Status:** Accepted (2026-09)

`infi onboard` / `infi_onboard` return missing questions before provisioning.
Email, business name and intent are supplied by the conversation, never guessed
from a git author or local profile. Existing app credentials lead to diagnosis
instead of a new signup. The human receives the exact claim URL and expiry.

The existing bootstrap engine saves a private, gitignored recovery journal before
provisioning and credentials before catalog sync. Repeated runs use the same
account and preserve user environment/configuration. Ambiguous network outcomes
are reported instead of replaying the public POST, which is not idempotent.

MCP keeps the successfully selected account for subsequent tools in that server
session. Signup never verifies an email, creates a human identity, or enables
production. `ready` means setup checks passed, not that app integration passed.

The new MCP export requires CLI >=0.2.6. Release the backend's new provision
response before packages and documentation.
