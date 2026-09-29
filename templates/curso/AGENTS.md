# AGENTS.md — Curso template (Infi)

You are editing a course site: a sales page, a Netflix-style member area and
server-rendered lesson pages, on Infi. The owner edits this code with you.
Change freely what things look like and what they say. Do not change how
payment, access and login work.

## What never changes

1. **Access is decided by Infi, on the server.** Lesson pages
   (`src/app/curso/[id]/aula/[lessonId]/page.tsx`) render only what the portal
   API returned for the student's token: the video link and the text exist only
   when the lesson's `state` is `available`. Never render a lesson from
   anything else, never cache a lesson across students, and never move that read
   to a `"use client"` file.
2. **The student's token is never in `localStorage` or a URL.** It lives in the
   httpOnly cookie `infi_bt` (`/api/portal-token`, path `/`) and is read only by
   `src/lib/member.ts`, which starts with `import "server-only"`.
3. **The secret key stays on the server.** `INFI_SECRET_KEY` is read only in
   `src/lib/infi.ts` and `scripts/seed.mjs`. Never import it from a client file,
   never rename it to `NEXT_PUBLIC_*`, never commit `.env.local`.
4. **Access follows the money in Infi, not here.** A purchase grants the `curso`
   key; a full refund or chargeback revokes it; a late subscription keeps it with a
   warning; a canceled one loses it at the end of the paid period. Never grant or
   revoke access from this site's code or from the checkout's `onComplete`.
5. **"Done" is one rule.** `LessonPlayer` marks a lesson done at the end or past
   ~90%, the same for every provider. Do not add per-provider completion logic.
6. **Product keys keep the `curso/` prefix.** Renaming a key creates a new product.

## The course

The course's structure (modules, lessons, video links, markdown, drip) lives in
Infi, not in this repo. `curso.seed.json` is only the first version
`npm run infi:seed` creates; after that, edit the course through the API: the
Infi dashboard, the CLI, or the Infi MCP tools (`infi_lesson_create`,
`infi_lesson_update`, `infi_course_lessons_reorder`, …). A new lesson appears
without a deploy.

- **Video:** paste the link from the owner's provider. Infi detects the provider;
  the player adapts. Tell the owner to restrict the video to their domain
  (`GUIA-VIDEO.md`) — YouTube cannot be restricted.
- **Drip:** `unlockAfterDays` counts from the student's access. A locked lesson
  shows when it unlocks.
- **Unpublish** instead of deleting when a lesson needs fixing. Deleting removes
  everyone's progress on it.

## Selling access

`infi.company.ts` has the products; `curso.seed.json` says what each grants
(`lifetime`, `subscription`, or `days` with a number). To sell "12 months of
access", add a one-time product and give it `{ "window": "days", "days": 365 }`
with `infi.access.setProductRules`.

## Elements

From `@beinfi/elements-react`: `<InfiProvider>`, `<StoreElement>`,
`<CheckoutElement>`, `<PortalElement>` (login and "Minhas compras"),
`<CourseElement>` (the course outline) and `<LessonPlayer>` (the player). The rows
use the shadcn `Carousel` (`src/components/ui/carousel.tsx`). Restyle with CSS and
props; update by bumping the package version; do not fork the elements.

## What does not exist here

Video hosting, certificates, comments, quizzes, affiliates, a native community,
WhatsApp, a newsletter, a single buyer panel across stores. If the owner asks for
one, say Infi does not offer it here yet, and do not improvise one.

## Commands

```bash
npm run dev          # against your sandbox
infi login           # (re)writes .env.local
infi sync --plan     # what would change in the catalog
infi sync            # apply infi.company.ts
npm run infi:seed    # access key, grants, first course (once per mode)
infi deploy --url https://your-site   # webhook + INFI_WEBHOOK_SECRET
```
