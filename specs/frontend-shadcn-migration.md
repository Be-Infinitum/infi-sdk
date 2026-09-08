# Spec — The dashboard on stock shadcn/ui: every primitive theirs, one color ours

**Status:** executed on 2026-09-06 on the `feat/stock-shadcn` branch of `frontend` (worktree
`Infi/.worktrees/shadcn/frontend`), steps 0–7 and 9; step 8 (retiring the package) awaits Caio.
Written for review on 2026-09-05 and verified against `frontend` on disk and the shadcn
docs/changelog of the same day. Nine decisions are listed up front; the rest of the document
follows from them. What the execution taught, beyond the plan, is in the last section.

## The claim

After this migration, `src/components/ui/` contains only files that `shadcn add` wrote. Running
`npx shadcn@latest add <name> --overwrite` on any of them produces an empty `git diff`.
`globals.css` is what `shadcn init` writes, plus seven lines that set the brand purple, plus the
CSS two third-party libraries need. `@be-infinitum/design-system` is gone — from `package.json`
in the first step, and as a repository and published package in the last. There is no
design-system catalog to memorise, because there is nothing of ours to memorise: the answer to
every "how do I build X" question is a page on ui.shadcn.com, and the answer to "which color" is
always the same one.

That is the look of ElevenLabs, Polymarket and Cap: stock shadcn on a neutral base, 14px text,
one accent color doing all the work, no gradients, no mono-uppercase chrome, no entrance
animations. What reads as "designed" in those products is restraint, not primitives. We currently
have the opposite ratio — many primitives, little restraint — and the fix is to delete, not to
design.

## What we have today

Three layers style the dashboard, and they disagree with each other.

| Layer | What it is | Size |
|---|---|---|
| `@be-infinitum/design-system` 0.2.0 | `tokens.css` (purple 50–950, gold 50–700, linen, charcoal, ~45 semantic tokens), `components.css` (`.beinfi-button/-input/-card/-badge/-label` styled by `data-variant`/`data-size`), and React `Button`, `Badge`, `Card*`, `Input`, `Textarea`, `Label`. **Slated for deletion**; the repo's README still calls it canonical. | 2 CSS files, 6 components |
| `src/components/ui/` | 21 files. Five are bare re-exports of the package (button, badge, card, input, label). Nine are Radix wrappers hand-styled with our tokens (dialog, sheet, dropdown-menu, select, tabs, tooltip, table, skeleton, separator). Seven are house inventions: `Alert` (6 variants), `MonoLabel`, `CodeInline`, `IconTile`, `StatValue`, `Stepper`, and a native `Checkbox` (ADR 0036). Two of them call `useTranslations`. | 21 files |
| `src/app/globals.css` | Imports the package CSS, maps ~100 tokens into `@theme inline`, then **overrides the package's own sizes** under `body:has(.dashboard-shell)` (buttons 32/36/40px, inputs 36px, body 13px, card padding 16px), sets `::selection`, five keyframes, a checkout-only font stack (`.checkout-canvas`, SF Pro), a hairline grid, and the embed-height guard. | 330 lines |

Around them: `framer-motion` for `MotionStagger` (30 call sites), `BlurFade` (10) and
`NumberTicker`; an ambient KPI sparkline texture; a radial brand gradient on the auth hero;
Sora + Geist Mono with a "two voices" rule (mono ≤14px for measurements, display ≥20px for
titles); Phosphor icons behind a barrel that re-exports them **under lucide names**; recharts
themed through our own `chart-theme.ts` / `chart-primitives.tsx`; a 409-line hand-built sidebar
with its own collapse state in `localStorage`.

Five ADRs and a 150-line catalog (`.claude/design-system.md`) exist to keep contributors from
re-inventing patterns. They document the problem this spec removes: ADR 0023 explicitly
**rejected the shadcn registry** because "the primitives deliberately diverged from stock
shadcn; a registry would fight that drift". We are choosing the registry and ending the drift.

Usage, so the blast radius is known (files importing each, non-test):

| Primitive | Files | Primitive | Files |
|---|---|---|---|
| button | 72 | select | 16 |
| card | 35 | dialog | 16 |
| input | 32 | code-inline | 10 |
| badge | 29 | tabs | 10 |
| label | 29 | dropdown-menu | 6 |
| alert | 21 | stat-value | 5 |
| mono-label | 20 | checkbox / icon-tile / sheet / table / tooltip | 3 each |
| skeleton | 19 | separator / stepper | 2 each |

265 `.tsx` files, ~24k lines outside tests; 31 dashboard pages; 24 checkout files.

## The nine decisions

Each is a default of the tool unless noted. Taking the default is the point; the two that are
not defaults are marked and are the ones that need Caio's yes.

1. **Base: Base UI.** shadcn made Base UI the default in July 2026 and ships every component for
   both bases. We are replacing every `ui/` file anyway, so this choice costs nothing now and is
   never free again. Radix packages leave the repo either way. Fallback: `-b radix` on init, one
   flag, if a component misbehaves in a way we cannot live with.
2. **Preset: Nova, base color `neutral`, CSS variables on.** Nova is what `--defaults` gives and
   is the compact style — right for a dashboard, and it replaces our 13px density hack with the
   tool's own density. Radius: whatever the preset writes; we do not touch it.
3. **Color: `#5B21B6` and nothing else.** That hex is the brand kit's primary (34 occurrences in
   `brand-kit/`, 4 of the hover `#4C1D95`, 1 of `#7D3CFF`). It is written into exactly these
   variables: `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring`, `--chart-1`, with
   white as `--primary-foreground` / `--sidebar-primary-foreground`. There is no hover or
   pressed token — shadcn's Button uses `hover:bg-primary/90`. Gold, the purple scale, `linen`,
   `charcoal`, `surface-*`, `text-*`, `brand`, `brand-gradient`: gone.
4. **Fonts: Geist Sans + Geist Mono** through `next/font/google`, the shadcn Next template's
   pair. Sora and `--font-display` go; the "two voices" rule goes with them. Mono is used where
   shadcn uses it: `Kbd`, inline `code`, and `tabular-nums` on numbers. *(Not a shadcn default in
   the strict sense — the preset picks fonts — but it is the template's.)*
5. **Icons: `lucide-react`**, the default. The Phosphor barrel already exports under lucide
   names, so most call sites change only an import path. **Not a neutral choice for us**: we
   moved *to* Phosphor deliberately. If the look of Phosphor matters, `iconLibrary: "phosphor"`
   in `components.json` is a first-class option and the CLI writes components with it — one line,
   still zero custom code. Recommendation: lucide, because it is what every reference product
   uses and one less thing to explain.
6. **Status hues: none at launch.** ⚠️ This is the visible one. Today `paid` is green, `pending`
   amber, `failed` red, `sandbox` orange, `live` green — nine token pairs. shadcn's Badge has
   `default | secondary | destructive | outline | ghost | link`; Alert has `default |
   destructive`. `StatusBadge` will map every status to those and carry a lucide icon inside the
   badge (supported natively), so `paid ✓`, `failed ✕`, `pending ◷` stay legible without hue.
   The sandbox banner becomes `secondary` with a bold label. If after a week of use green is
   missed, the sanctioned path is the theming doc's "adding a custom color": one `--success`
   pair in `:root`/`.dark` and `@theme inline`, and a `success` variant is **not** added to
   `badge.tsx` (that file is CLI-owned) — it is `className="bg-success/10 text-success"` at the
   `StatusBadge` call site. Decide after use, not before.
7. **Dark mode: the generated `.dark` block stays, no toggle.** ADR 0040's light-only stands;
   `next-themes` later is one doc page and zero design work, because every token already has a
   dark value.
8. **i18n inside `ui/`: none.** Stock `DialogContent`/`SheetContent` render a literal sr-only
   "Close". Our current wrappers translate it. We accept the literal — the dialog is named by its
   `DialogTitle`, and `ui/` must stay hook-free and CLI-owned. Revisit only on a real report.
9. **`cn` from the `cn` package**, via `npx shadcn@latest migrate cn` (September 2026); `clsx`
   and `tailwind-merge` leave. `class-variance-authority` stays — shadcn's own components use it.

Tooling note: `package.json` declares `pnpm@10` but only `package-lock.json` exists and the
frontend `CLAUDE.md` says `npm run build`. Every command below uses `npx shadcn@latest`; whoever
runs it uses whichever lockfile is real that day.

## Mapping: what each thing becomes

### `src/components/ui/` — 21 files → CLI output only

| Today | After | Call-site changes |
|---|---|---|
| `button` (package re-export; variants `default/primary/secondary/outline/ghost/link/destructive/danger`, sizes `sm/md/lg/icon`) | `shadcn add button` — `default/outline/secondary/ghost/destructive/link`; sizes `xs/sm/default/lg/icon/icon-xs/icon-sm/icon-lg` | `primary`→`default`, `danger`→`destructive`, `size="md"`→drop. 72 files, mechanical. |
| `badge` (`default/secondary/outline/success/warning/danger/info/brand/gold`) | `shadcn add badge` — `default/secondary/destructive/outline/ghost/link` + icon child | `success/info/brand`→`default` or `outline` with icon; `warning`→`outline`; `danger`→`destructive`; `gold`→delete the usage. 29 files; most go through `StatusBadge`. |
| `card` (16px radius, `--card-shadow`, display-font title) | `shadcn add card` (`Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter`) | `CardAction` replaces our right-aligned header hacks. 35 files. |
| `input`, `label` (re-exports; `Textarea` lives in `input.tsx`) | `shadcn add input textarea label` | `Textarea` import path changes. 32 + 29 files. |
| `dialog`, `sheet`, `dropdown-menu`, `select`, `tabs`, `tooltip`, `table`, `skeleton`, `separator` (Radix, hand-styled) | Same names, `--overwrite`, Base UI | Base UI's `Select` and `DropdownMenu` APIs differ from Radix in places (value/`onValueChange`, item rendering); each of the 16 + 6 sites is compiled and checked. Tabs `variant="underline"` (9 sites) → `variant="line"` on `TabsList`. Tooltip background becomes `--primary` (stock): purple tooltips. That is the look; accept it. |
| `checkbox` (native input, ADR 0036) | `shadcn add checkbox` | 3 files. ADR 0036 superseded. |
| `alert` (6 variants) | `shadcn add alert` — `default/destructive` + `AlertTitle/AlertDescription/AlertAction` + icon | `success/info/brand/neutral`→`default` with a lucide icon; `warning`→`default` with `TriangleAlert`; `danger`→`destructive`. 21 files. |
| `mono-label` | **deleted** | Sidebar group labels → `SidebarGroupLabel`. Card captions → `CardDescription`. Form legends → `FieldLegend`. Everything else → `text-sm text-muted-foreground`. No uppercase, no mono. 20 files. |
| `code-inline` | **deleted** | ids/URLs/secrets → `<code className="font-mono text-xs">` (the Typography page's inline code) or `Kbd` for keys; `breakAll` → `break-all` at the site. 10 files. |
| `icon-tile` | **deleted** → `Item` family: `ItemMedia variant="icon"` | 3 files. |
| `stat-value` | **deleted** → the `dashboard-01` block's card recipe (`CardDescription` label, `CardTitle className="text-2xl font-semibold tabular-nums"`) | 5 files, all through `KPIStat`. |
| `stepper` | Moves to `src/components/stepper.tsx` (ours, domain-level), rebuilt on `Progress` + plain text. shadcn has no stepper. | 2 files (onboarding, go-live). |

New from the registry, because they replace things we wrote: `field` (all forms — `Field,
FieldLabel, FieldDescription, FieldError, FieldGroup, FieldSet, FieldLegend`, with
react-hook-form as the forms doc shows), `item`, `empty`, `kbd`, `spinner`, `progress`,
`breadcrumb`, `sonner`, `command`, `chart`, `sidebar`, `alert-dialog` (destructive confirms that
today are `Dialog`), `native-select` where a `<select>` is enough.

### Domain components (`src/components/`) — ours, but built only from the above

| Today | After |
|---|---|
| `KPIStat` (131 lines: icon tile, ticker, sparkline texture, privacy mask) + `DeltaChip` + `MetricStrip` | The `dashboard-01` "SectionCards" recipe: `Card` with `CardDescription`, `CardTitle` (tabular), `CardAction` holding `Badge variant="outline"` with `TrendingUp/Down`. Privacy mask stays (it is a feature) as an `icon-sm` ghost button in `CardAction`. Ticker, sparkline, stagger: deleted. |
| `PageHeader` / `EmptyState` / `ErrorState` | `PageHeader` stays as an `h1` + `p` + actions row (blocks do this inline; one component is fine). `EmptyState` → `Empty` (`EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent`). `ErrorState` → `Alert variant="destructive"`. |
| `DetailPageShell` | `Breadcrumb` + `PageHeader`; loading via `Skeleton`. |
| `DataTable` (237 lines) | The Data Table doc's recipe verbatim: tanstack + `Table` + `Pagination`/`Button` + `Skeleton`. The `surface="finance"` variant goes. |
| `StatusBadge` | Same job, decision 6: a map from status → `{variant, icon}`. New statuses still go in the map. |
| `charts/chart-theme.ts`, `chart-primitives.tsx`, `sparkline-texture.tsx` | `shadcn add chart`: `ChartContainer` + `ChartConfig` (`pix: {label, color: "var(--chart-1)"}`, cartão `--chart-2`, boleto `--chart-3`), `ChartTooltip`/`ChartTooltipContent`, `ChartLegend`. `SeriesGradient` and the OKLCH method→hue rule are deleted. Sparkline texture deleted. |
| `motion/blur-fade.tsx`, `motion/number-ticker.tsx` (`MotionStagger` ×30, `BlurFade` ×10) | **Deleted**, `framer-motion` removed. Pages render; nothing fades in. `tw-animate-css` stays — shadcn's overlays use it. |
| `MoneyAmount`, `BrandLogo`, `LanguageSwitcher`, `CodeBlock` (shiki) | Stay. `MoneyAmount` keeps `tabular-nums` and nothing else. |
| `providers/provider-badge.tsx` (the one `cva` outside `ui/`) | `Badge variant="outline"` + the provider mark. |

### Shell

`shell/sidebar.tsx` (409 lines, `w-[220px]`/`w-[60px]`, `localStorage` collapse, hand-rolled
tooltips and Sheet on mobile) → the `sidebar-07` block composition: `SidebarProvider` +
`Sidebar collapsible="icon"` + `SidebarHeader` (logo) + `SidebarContent` with one `SidebarGroup`
per nav group (`SidebarGroupLabel`, `SidebarMenu`, `SidebarMenuButton asChild` around `Link`,
`isActive`, `tooltip` prop — collapsed tooltips come for free) + `SidebarFooter` (environment
item, language, account `DropdownMenu`) + `SidebarRail`. `MobileSidebarTrigger` → `SidebarTrigger`;
the mobile Sheet is built in. `AppShell` → `SidebarProvider` › `Sidebar` + `SidebarInset` ›
header (`SidebarTrigger`, `Separator orientation="vertical"`, `Breadcrumb`) › `main`. Collapse
state persists the way the component persists it. `CommandPalette` → `Command` +
`CommandDialog`. `TestModeBanner` / `NoProviderBanner` → `Alert` (decision 6).

### Auth

`auth-hero-panel.tsx` (radial purple gradient, gold accents, routing illustration) and
`--brand-auth-gradient` are deleted. Login, signup, onboarding, claim take the `login-02`-style
layout: centered `Card`, `Field` groups, `Button` full width, provider buttons `outline`.
`auth-quiet.module.css` goes if nothing needs it after that.

### Checkout (`/pay`, `/embed`, 24 files)

Same primitives, same tokens — the buyer sees the same purple button the merchant sees. Delete
`.checkout-canvas` (SF Pro override), `.checkout-hairgrid`, `.checkout-reveal`,
`.step-slide-in`, `animate-pulse-ripple`, and the 13px/11px arbitrary sizes (34 of the 63
`text-[Npx]` in the repo are here) in favour of `text-sm`/`text-xs`. The checkout's own
uppercase-tracking label style is deleted like `MonoLabel`. Exceptions that stay: the Stripe
Elements `appearance` object in `card-payment-section.tsx` (13 hex values — read them from
`getComputedStyle(document.documentElement)` for `--primary`, `--border`, `--ring`,
`--destructive` at mount instead of literals), provider and OAuth marks (licensed colors), and
the embed-height guard rules in `globals.css` (behaviour, not style — documented in the file).

### `globals.css` after

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "@xyflow/react/dist/style.css";

/* ---- everything from here to the @layer base block is `shadcn init` output ---- */
@custom-variant dark (&:is(.dark *));
:root { …neutral tokens, --radius, --chart-1..5, --sidebar-*… }
.dark { … }
@theme inline { … }
@layer base { * { @apply border-border outline-ring/50; } body { @apply bg-background text-foreground; } }
/* ---- end of generated block ---- */

/* Brand. The only hue we own; see ADR 0067. */
:root, .dark {
  --primary: #5B21B6;
  --primary-foreground: #ffffff;
  --ring: #5B21B6;
  --sidebar-primary: #5B21B6;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-ring: #5B21B6;
  --chart-1: #5B21B6;
}

/* Third-party: React Flow chrome on our tokens. */
.react-flow__edge.routing-edge-active .react-flow__edge-path { stroke: var(--primary); stroke-width: 2; }
.react-flow__edge-text { font-size: 10px; fill: var(--muted-foreground); }
.react-flow__controls { border: 1px solid var(--border); border-radius: var(--radius); box-shadow: none; overflow: hidden; }

/* Embed-height guard (unchanged; see the comment block in the current file). */
[data-infi-embed-root] [class*="min-h-screen"], … { min-height: 0 !important; height: auto !important; }
```

Whether `.dark` gets the same purple or a lighter step is a one-line question for the day dark
mode ships; until then it is inert.

## Sequence

Each step ends with `build`, `lint`, `test` and `knip` green and one commit on `main` (the
frontend's rule: no PRs). Import paths under `@/components/ui/*` are unchanged throughout, so
overwriting one file re-styles every call site at once — the compiler then lists the variant
renames.

| # | Step | What breaks and how it is fixed | Size |
|---|---|---|---|
| 0 | **Preflight.** `npx shadcn@latest init --defaults` in a scratch checkout to see exactly what Nova/neutral writes (radius, fonts, `components.json`). Decide 1–9 on that output. | Nothing ships. | hours |
| 1 | **Foundation, in one commit.** `init` for real; `globals.css` replaced as above; `fonts.ts` → Geist pair; `migrate cn`; `add button badge card input textarea label`; remove `@be-infinitum/design-system` from `package.json`, both `@import`s, and the five re-export files. | The package and the re-exports must go together — the re-exports need the package CSS. Variant renames across 72 + 29 + 35 + 32 + 29 files. The density hack disappears with the file. Four tests reference `.beinfi-card` / logo assets: updated. | 1–2 days |
| 2 | **Overlays and controls.** `add --overwrite dialog sheet dropdown-menu select tabs tooltip table skeleton separator checkbox alert-dialog native-select`. Remove the six `@radix-ui/*` devDependencies. | Base UI API differences at 16 select + 16 dialog + 6 dropdown sites; `underline`→`line` at 9 tabs sites; ADR 0036 superseded. | 1–2 days |
| 3 | **House primitives out.** `add field item empty kbd spinner progress breadcrumb sonner command chart sidebar`. Delete `alert` variants (overwrite), `mono-label`, `code-inline`, `icon-tile`, `stat-value`; move `stepper` to `components/`. Forms onto `Field`. | 21 alert + 20 mono-label + 10 code-inline sites, mechanical. `lib/icons.ts` deleted, imports → `lucide-react` (decision 5). | 2 days |
| 4 | **Shell.** Sidebar → `sidebar-07`; `AppShell` → `SidebarProvider`/`SidebarInset`; command palette → `Command`; banners → `Alert`. | The one place with real layout work. | 1–2 days |
| 5 | **Domain.** KPI cards → `dashboard-01` recipe; `Empty`; `Breadcrumb`; `DataTable` → docs recipe; `StatusBadge` map; charts → `ChartContainer`; delete `motion/`, sparkline, `framer-motion`, `@phosphor-icons/react`. | 30 `MotionStagger` wrappers unwrap to their children. Chart colors via `ChartConfig`. | 2 days |
| 6 | **Auth.** `login-02` layout; delete hero panel, gradient, module CSS. | Visual; the flows are unchanged. | 1 day |
| 7 | **Checkout.** Primitives already swapped by steps 1–3; this step deletes the checkout-only CSS, the arbitrary sizes and the label style, and moves the Stripe appearance to computed tokens. Verify `/embed` at 320px and inside the iframe (the guard rules stay). | 24 files. | 1–2 days |
| 8 | **Retire the package.** With the frontend no longer importing it (step 1) and `backoffice`/`landing` never having consumed it, `@be-infinitum/design-system` has zero consumers. Deprecate the published `0.2.0` on GitHub Packages, archive the `Be-Infinitum/design-system` repository, and delete the local checkout at `~/Infi/design-system`. Its README calling itself "canonical foundations for Beinfi interfaces" is the reason this is a step and not a footnote: left alive, it argues against this spec. | Nothing in `frontend` changes; `npm ls` already proves the dependency is gone. | hours |
| 9 | **Docs and enforcement.** ADR 0067 *"Stock shadcn/ui, one brand color"* (supersedes 0019, 0023, 0036, 0040; amends 0026: `--primary` is the brand, `--brand` no longer exists). `.claude/design-system.md` → ~20 lines: the nine decisions, the exceptions list, and "everything else: ui.shadcn.com". `CLAUDE.md` pointer updated. ESLint `no-restricted-imports` for `framer-motion`, `@be-infinitum/*`, `@radix-ui/*`, `@phosphor-icons/*`, `clsx`, `tailwind-merge`. `knip` keeps ignoring `components/ui/**`. | — | half a day |

Roughly two weeks of one person, steps 1–3 being mechanical and 4–7 being the work. Steps 4–7
are independent of each other once 1–3 land, so they can be split. Step 8 is the only step that
happens outside the `frontend` repository.

## Acceptance

The whole spec collapses into checks a script can run:

```sh
# 1. ui/ is CLI-owned: overwriting every file changes nothing.
for c in $(ls src/components/ui | sed 's/\.tsx$//'); do npx shadcn@latest add "$c" --overwrite --yes; done
git diff --exit-code -- src/components/ui

# 2. Nothing of ours is left in the styling layer.
! grep -rE --include='*.tsx' --include='*.css' \
  'beinfi-|@be-infinitum|framer-motion|@radix-ui|@phosphor-icons|font-display|MonoLabel|CodeInline|IconTile|StatValue|surface-(brand|subtle)|text-text-|border-strong|(bg|text|border|from|to|via|ring)-(purple|gold)-[0-9]|--brand|charcoal|linen|dashboard-shell|checkout-canvas|checkout-hairgrid|checkout-reveal|step-slide-in|pulse-ripple' src

# 3. The hue budget: brand hex appears in globals.css only.
test "$(grep -rliE --include='*.tsx' '#5b21b6|#4c1d95|#7d3cff' src | grep -vc 'card-payment-section\|provider-icons\|oauth-icons')" = 0

# 4. Dependencies — and the package itself.
! npm ls @be-infinitum/design-system framer-motion @phosphor-icons/react clsx tailwind-merge 2>/dev/null | grep -q '@'
gh repo view Be-Infinitum/design-system --json isArchived -q .isArchived | grep -q true
test ! -d ~/Infi/design-system
npm run build && npm run lint && npm test && npm run knip
```

Plus a visual walk that no script replaces: 31 dashboard pages, 4 auth surfaces, `/pay` and
`/embed` at 320px and desktop, every `DropdownMenu`/`Select`/`Dialog` opened once (the Base UI
swap is where behaviour can change), and the sidebar collapsed, expanded, and on a phone.

## What this does not do

- **Does not touch `landing` or `backoffice`.** Landing has no `components.json` and its own
  violet; backoffice is HeroUI. Unifying them is a later decision — but if it happens, it is
  now "run the same nine decisions there", not a design project. Neither ever consumed the
  design-system package, so retiring it (step 8) touches nothing there.
- **Does not add dark mode, a theme toggle, or `next-themes`.** Decision 7.
- **Does not redesign any flow.** Same pages, same routes, same copy, same i18n catalogs (some
  `common.*` keys become unused and `knip` will not see them; a pass over `messages/` at step 8).
- **Does not keep any of the following even as opt-in**: the purple/gold scales, the brand
  gradient, the two-voice typography rule, `MotionStagger`, the sparkline texture, the density
  override, `::selection` styling, custom keyframes. Deletion is the deliverable.

## Open risks

- **Base UI vs Radix behaviour** at ~40 overlay call sites. Mitigation: per-component commits
  (step 2), and the `-b radix` fallback is a re-run of steps 1–2 with one flag, not a redesign.
- **Status colours** (decision 6) are the change a merchant will notice first. Mitigation is the
  sanctioned one-token fallback, decided after a week, not a variant in a CLI-owned file.
- **Purple tooltips and purple `default` badges.** Stock shadcn puts `--primary` on both. With a
  saturated brand this is louder than today's charcoal tooltip. It is also exactly what
  Polymarket and Cap look like. If it grates, the fix is a lighter `--primary` in `.dark` only —
  never a tooltip override.
- **Checkout fonts inside merchants' iframes.** Geist replaces the system-font stack the buyer
  saw; `next/font` self-hosts, so no extra request to a third party, but the frame is slightly
  heavier. Measure once on `/embed`.
- **Tests coupled to class names** — four files today. Any new test asserting on shadcn's class
  strings is a test of shadcn, not of us; assert on roles and text instead.

## What execution added to the plan

Seven commits on `feat/stock-shadcn`, each with build, lint and the 2,364 tests green:

1. `feat(ui)` — foundation, the five package-backed primitives, the 130 type errors of the
   Base UI swap fixed in one pass (the compiler was the migration checklist).
2. `refactor(ui)` — the house primitives deleted, the semantic hues swept.
3. `feat(shell)` — `sidebar-07`.
4. `refactor(domain)` — `dashboard-01` cards, `Empty`, `Breadcrumb`, `ChartContainer`;
   framer-motion gone.
5. `feat(auth)` — `login-02`, `Field` forms.
6. `refactor(checkout)` — same tokens as the dashboard.
7. `docs` — ADR 0067, the five-rule design-system doc, ESLint guards, knip.

Things the plan did not know:

- **`shadcn init` on an existing project hangs in silent mode and reaches for pnpm** when
  `package.json` carries a `packageManager` field — and pnpm then fails on the private
  package. The field was removed (the repo has an npm lockfile) and `init` was replaced by
  writing `components.json` and `globals.css` from a scratch `init --defaults` run, then
  `shadcn add … --overwrite`. Same output, no prompt.
- **The `shadcn` package is now a runtime dependency**: `globals.css` imports
  `shadcn/tailwind.css`. knip must be told, as it must about `next-themes`, which only the
  CLI-owned `sonner.tsx` imports.
- **Base UI's API surface, concretely**: `asChild` → `render={<Link />}` (26 sites);
  `onValueChange(value: string | null)` on Select (7 sites needed `?? ""`); `onCheckedChange`
  on Checkbox (5); `Tooltip` has no `delayDuration`; `SheetContent` has no
  `onInteractOutside` (the Radix popper workaround in the invoice sheet simply went away);
  `DropdownMenuItem` uses `onClick`, not `onSelect`. Nothing else broke.
- **Stripe Elements take hex, not oklch.** `card-payment-section.tsx` mirrors the neutral
  theme's tokens in hex with a comment, instead of reading computed variables as the plan
  said.
- **`text-white` inside Button is a legitimate class** and must not be swept; the sweep
  script excluded it.
- **Tests that broke were exactly the class-coupled ones**: one selecting `.beinfi-card`,
  one `findByText` on a title that now also appears in the breadcrumb, and the funnel-shell
  test asserting the hero illustration. Three edits.
- knip still lists `br-date.ts`, `br-phone.ts`, `viacep.ts` and seven exports — all
  pre-existing on `main`, untouched here.

Not done, on purpose: pushing the branch, merging to `main`, and step 8. Archiving a
repository and deprecating a published package are outward-facing; they wait for a yes.

## Where it stands (2026-09-07, end of day)

Every route is on stock shadcn and every screen on the list is now *composed*,
not merely swept. Build, lint and 2,524 tests are green. The branch is pushed as
`feat/stock-shadcn` on `Be-Infinitum/frontend`, merged up to `origin/main`.

### Done since the last revision of this file

| Screen | What it became |
|---|---|
| `providers/go-live-wizard.tsx` | Card header per step, `Field` for every input, `Item` for providers, wallets and Pix keys, `Empty` for the two empty states, `Spinner` for pending |
| `collection-mode/managed-activation-wizard.tsx` | each step a `FieldSet` named by its legend, `FieldGroup` grids, documents as `Item`, review rows as `Property`, footer as `CardFooter`, verdict as `Empty` |
| `routing/routing-builder.tsx` | composed, React Flow kept for the canvas |
| `metering/playground/page.tsx` | `Field` form; its labels had no `htmlFor` at all |
| `security/mfa-card.tsx` | `CardHeader`/`CardAction`, devices as `Item` |
| `providers/provider-connections-card.tsx` | a section of provider Cards instead of a card of cards |
| `coupons/coupons-panel.tsx`, `treasury/balance-positions.tsx` | stock `Empty`; positions became one Card each in a grid |
| 18 form files | label/input stacks became `Field`/`FieldLabel`/`FieldDescription`/`FieldError` |

Bugs the composition surfaced, all fixed on the way: two Selects in the managed
wizard rendered their raw values (`ltda`, `EVP`) because Base UI needs `items`;
the metering playground swallowed a failed send as an unhandled rejection and
crashed on malformed batch JSON; five `Alert`s passed a bare string and rendered
unstyled; the section counts were spans pretending to be badges.

### What is genuinely left

1. **The visual pass.** Roughly 25 dashboard screens have still never been
   opened in a browser. Type checks, lint and tests do not catch what a look
   catches — the green logo and the small type each got through all three.
   `npm run shots` now renders every route to `.shots/` in both themes; the
   dev server's Clerk instance is production, so `npm run shots:login` opens a
   window for a person to log in once before the run. Login, signup and the
   hosted checkout were checked this way on 2026-09-08 and read correctly;
   dark mode came out identical to light, which confirms the `.dark` block is
   still inert.
2. **`space-y-*` in layout positions**, 110 left, none of them a field stack.
   Plain Tailwind, not a house idiom; converting them to flex + gap is tidying,
   not migration.
3. **`Label` used directly** in nine files. It is a stock primitive, so this is
   only a question of whether a `Field` would read better; in `data-table.tsx`
   it is how the dashboard-01 block itself ships.

### Still waiting on a decision

- **Step 8, retiring `@be-infinitum/design-system`**: deprecate the published
  0.2.0, archive the repository, delete the local checkout. Irreversible and
  outward-facing, so it waits for a yes.
- **Status hues** (decision 6): revisit after a week of real use. If green is
  missed, the sanctioned path is one `--success` pair added at the call site,
  never a variant in a CLI-owned file.
- **Dark mode**: the `.dark` block is generated and inert. Shipping it is one
  doc page and zero design work.

### Branch logistics, closed

`feat/stock-shadcn` was merged to `main` on 2026-09-08 and pushed, together
with the managed branches in `backend` and `frontend` (the `backoffice` half
had already gone in as its PR #9). Every checkout is on `main`. The merge into
the migration branch resolved to the branch's own side everywhere the two
disagreed, which is provably right: `origin/main`'s tree was byte-identical to
the managed tip the branch had already merged, and the only semantic change on
main — `isManagedAvailable` — was already present. The one genuinely new
screen, the merchant logo card, was composed on stock parts as part of the
merge.

### Open in the same tree, not this migration

- `knip` still lists `br-date.ts`, `br-phone.ts`, `viacep.ts` and four exports.
  All predate this branch.
- The backend's `ManagedOffered()` and the `products.create` upsert fix are
  pushed on `feat/managed-collection-mode`.
