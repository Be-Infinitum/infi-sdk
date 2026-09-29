#!/usr/bin/env node
// `npm create infi-app [name] --template ecommerce` → `infi init`. The whole
// flow lives in @beinfi/cli (ADR 0003); this only forwards the arguments. The
// range is deliberately not a caret: ^0.x pins the minor and would never see
// a newer CLI.
import { initCommand } from "@beinfi/cli/commands/init";

await initCommand(process.argv.slice(2));
