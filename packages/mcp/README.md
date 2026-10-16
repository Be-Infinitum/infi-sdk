# @beinfi/mcp

MCP server for Cursor / Claude agents. Built on `@beinfi/sdk` + CLI libs (company as code).

## Tools

| Tool | Description |
|------|-------------|
| `infi_bootstrap` | Claim + `infi.company.ts` from intent + sync + doctor |
| `infi_claim_create` | Sandbox tenant (`ref`, optional `intent`) |
| `infi_doctor` | Setup diagnostics |
| `infi_go_live_status` | Claim → account → KYC guidance (never invents `sk_live_`) |
| `infi_sync_plan` | Company-as-code dry run. Allowed in live |
| `infi_sync_apply` | Company-as-code apply. **Sandbox keys only**, reads/writes `infi.company.<mode>.lock.json` in `cwd` |
| `infi_pull` | Read backend catalog |

## Cursor config

```json
{
  "mcpServers": {
    "infi": {
      "command": "npx",
      "args": ["-y", "@beinfi/mcp"]
    }
  }
}
```

## Live keys

With `sk_live_` (or any key that is not `sk_test_`) every tool that writes refuses:
`infi_sync_apply`, `infi_bootstrap`, `infi_onboard`, `infi_claim_create`. In live
the agent proposes with `infi_sync_plan`; the human applies with `infi sync`.

See [`AGENTS.md`](../../AGENTS.md) and ADR 0004.
