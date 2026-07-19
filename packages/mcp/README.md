# @beinfi/mcp

MCP server exposing Infi operations to Cursor and Claude Desktop agents.

## Tools

| Tool | Description |
|------|-------------|
| `infi_claim_create` | Provision sandbox tenant (`ref`: cursor, lovable, mcp, cli) |
| `infi_doctor` | Diagnose products, apps, env mistakes |
| `infi_sync_plan` | Dry-run billing-as-code |
| `infi_sync_apply` | Apply billing config |
| `infi_pull` | Read tenant catalog from backend |

## Cursor config

```json
{
  "mcpServers": {
    "infi": {
      "command": "npx",
      "args": ["-y", "@beinfi/mcp"],
      "env": {
        "INFI_SECRET_KEY": "sk_test_..."
      }
    }
  }
}
```

See [`AGENTS.md`](../../AGENTS.md) at the repo root.
