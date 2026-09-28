/**
 * Course, lesson, access and community tools — one per API route, so a
 * merchant can run the course by conversation ("create lesson 4 with this
 * Vimeo link") exactly as the dashboard and the CLI do (spec-curso-v1:
 * nothing is dashboard-only).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Infi } from "@beinfi/sdk";

type Client = () => Infi;

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value ?? { ok: true }, null, 2) }] });

const keySchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "lowercase letters, digits and hyphens");
const windowSchema = z.enum(["lifetime", "subscription", "days"]);
const ruleSchema = z.object({ key: keySchema, window: windowSchema, days: z.number().int().positive().optional() });
const lessonFields = {
  title: z.string().min(1).optional(),
  videoUrl: z.string().optional().describe("An https link on the merchant's own provider (Vimeo, Panda, Bunny, YouTube). Empty string removes it."),
  bodyMarkdown: z.string().optional().describe("The lesson's text in markdown. Empty string removes it."),
  unlockAfterDays: z.number().int().min(0).optional().describe("Drip: days after the student's access starts."),
  published: z.boolean().optional(),
};

export function registerCourseTools(server: McpServer, client: Client): void {
  // ── Access keys ──────────────────────────────────────────────────────────
  server.tool("infi_access_keys_list", "List the store's access keys (what products grant).", {}, async () =>
    text(await client().access.listKeys()),
  );
  server.tool(
    "infi_access_key_create",
    "Create an access key: a named thing the store sells access to (a course, a group, a plan).",
    { key: keySchema, name: z.string().min(1) },
    async (input) => text(await client().access.createKey(input)),
  );
  server.tool(
    "infi_access_key_rename",
    "Rename an access key (its handle never changes).",
    { key: keySchema, name: z.string().min(1) },
    async ({ key, name }) => text(await client().access.renameKey(key, name)),
  );
  server.tool(
    "infi_access_key_holders",
    "Everyone ever granted a key, and whether it holds now.",
    { key: keySchema },
    async ({ key }) => text(await client().access.holders(key)),
  );
  server.tool(
    "infi_product_access_get",
    "What buying a product grants.",
    { productId: z.string() },
    async ({ productId }) => text(await client().access.productRules(productId)),
  );
  server.tool(
    "infi_product_access_set",
    "Replace what buying a product grants: keys with a window (lifetime, while the subscription is active, or N days). Access already sold keeps its window.",
    { productId: z.string(), rules: z.array(ruleSchema) },
    async ({ productId, rules }) => text(await client().access.setProductRules(productId, rules)),
  );
  server.tool(
    "infi_access_grant",
    "Grant a key by hand (bonus, support case). Audited: always pass the reason the merchant gave.",
    { externalId: z.string(), key: keySchema, days: z.number().int().positive().optional(), reason: z.string().min(1) },
    async (input) => text(await client().access.grant(input)),
  );
  server.tool(
    "infi_access_revoke",
    "Revoke one grant by hand. Audited: always pass the reason the merchant gave.",
    { grantId: z.string(), reason: z.string().min(1) },
    async ({ grantId, reason }) => text(await client().access.revoke(grantId, reason)),
  );
  server.tool(
    "infi_access_check",
    "Does this customer hold this key now? (past_due still has access, with a warning.)",
    { externalId: z.string(), key: keySchema },
    async ({ externalId, key }) => text(await client().access.check(externalId, key)),
  );
  server.tool(
    "infi_access_customer",
    "Every key one customer holds or held, and why it ended.",
    { externalId: z.string() },
    async ({ externalId }) => text(await client().access.forCustomer(externalId)),
  );

  // ── Courses ──────────────────────────────────────────────────────────────
  server.tool("infi_courses_list", "List the store's courses (drafts included).", {}, async () =>
    text(await client().courses.list()),
  );
  server.tool(
    "infi_course_get",
    "The whole course tree: modules and lessons with their content, drafts included.",
    { courseId: z.string() },
    async ({ courseId }) => text(await client().courses.get(courseId)),
  );
  server.tool(
    "infi_course_create",
    "Create a course, opened by an access key (create the key first).",
    {
      title: z.string().min(1),
      accessKey: keySchema,
      description: z.string().optional(),
      coverUrl: z.string().optional(),
      published: z.boolean().optional(),
    },
    async (input) => text(await client().courses.create(input)),
  );
  server.tool(
    "infi_course_update",
    "Edit a course: title, description, cover, the key that opens it, published.",
    {
      courseId: z.string(),
      title: z.string().min(1).optional(),
      accessKey: keySchema.optional(),
      description: z.string().optional(),
      coverUrl: z.string().optional(),
      published: z.boolean().optional(),
    },
    async ({ courseId, ...input }) => text(await client().courses.update(courseId, input)),
  );
  server.tool(
    "infi_course_delete",
    "Delete a course with its lessons and everyone's progress on it. Confirm with the merchant first.",
    { courseId: z.string() },
    async ({ courseId }) => text(await client().courses.delete(courseId)),
  );
  server.tool(
    "infi_course_module_create",
    "Add a module at the end of a course.",
    { courseId: z.string(), title: z.string().min(1) },
    async ({ courseId, title }) => text(await client().courses.createModule(courseId, title)),
  );
  server.tool(
    "infi_course_module_rename",
    "Rename a module.",
    { courseId: z.string(), moduleId: z.string(), title: z.string().min(1) },
    async ({ courseId, moduleId, title }) => text(await client().courses.renameModule(courseId, moduleId, title)),
  );
  server.tool(
    "infi_course_module_delete",
    "Delete a module and its lessons. Confirm with the merchant first.",
    { courseId: z.string(), moduleId: z.string() },
    async ({ courseId, moduleId }) => text(await client().courses.deleteModule(courseId, moduleId)),
  );
  server.tool(
    "infi_course_modules_reorder",
    "Reorder a course's modules: every module id, once, in the new order.",
    { courseId: z.string(), ids: z.array(z.string()).min(1) },
    async ({ courseId, ids }) => text(await client().courses.reorderModules(courseId, ids)),
  );
  server.tool(
    "infi_lesson_create",
    "Add a lesson to a module: title, the video link from the merchant's provider (provider detected), optional markdown, drip. Unpublished unless published is true.",
    { courseId: z.string(), moduleId: z.string(), ...lessonFields, title: z.string().min(1) },
    async ({ courseId, ...input }) => text(await client().courses.createLesson(courseId, input)),
  );
  server.tool(
    "infi_lesson_get",
    "One lesson with its content.",
    { courseId: z.string(), lessonId: z.string() },
    async ({ courseId, lessonId }) => text(await client().courses.getLesson(courseId, lessonId)),
  );
  server.tool(
    "infi_lesson_update",
    "Edit a lesson; move it with moduleId; unpublish it with published=false (kept, hidden from students).",
    { courseId: z.string(), lessonId: z.string(), moduleId: z.string().optional(), ...lessonFields },
    async ({ courseId, lessonId, ...input }) => text(await client().courses.updateLesson(courseId, lessonId, input)),
  );
  server.tool(
    "infi_lesson_delete",
    "Delete a lesson and everyone's progress on it. Confirm with the merchant first.",
    { courseId: z.string(), lessonId: z.string() },
    async ({ courseId, lessonId }) => text(await client().courses.deleteLesson(courseId, lessonId)),
  );
  server.tool(
    "infi_course_lessons_reorder",
    "Reorder one module's lessons: every lesson id of the module, once, in the new order.",
    { courseId: z.string(), moduleId: z.string(), ids: z.array(z.string()).min(1) },
    async ({ courseId, moduleId, ids }) => text(await client().courses.reorderLessons(courseId, moduleId, ids)),
  );
  server.tool(
    "infi_course_student",
    "The course as one customer sees it: access, drip, progress, where they continue.",
    { courseId: z.string(), externalId: z.string() },
    async ({ courseId, externalId }) => text(await client().courses.student(courseId, externalId)),
  );

  // ── Community ────────────────────────────────────────────────────────────
  server.tool(
    "infi_community_telegram_connect",
    "Link a Telegram group to an access key. The merchant must first make Infi's bot an admin able to invite users and ban members.",
    { chatId: z.string(), accessKey: keySchema },
    async (input) => text(await client().community.connectTelegram(input)),
  );
  server.tool(
    "infi_community_discord_connect",
    "Link a Discord server's paid role to an access key. Infi's Discord bot must be in the server.",
    { guildId: z.string(), roleId: z.string(), accessKey: keySchema, inviteUrl: z.string().optional() },
    async (input) => text(await client().community.connectDiscord(input)),
  );
  server.tool("infi_community_list", "The store's communities.", {}, async () => text(await client().community.list()));
  server.tool(
    "infi_community_members",
    "Who was invited, added and removed from a community, and why.",
    { integrationId: z.string() },
    async ({ integrationId }) => text(await client().community.members(integrationId)),
  );
  server.tool(
    "infi_community_disable",
    "Stop managing a community. Nobody is removed for it.",
    { integrationId: z.string() },
    async ({ integrationId }) => text(await client().community.disable(integrationId)),
  );

  // ── Customer login ───────────────────────────────────────────────────────
  server.tool(
    "infi_customer_login_settings",
    "Read or set whether a first login by a new e-mail creates the customer (on by default). Pass signupByLogin to set it.",
    { signupByLogin: z.boolean().optional() },
    async ({ signupByLogin }) =>
      text(
        signupByLogin === undefined
          ? await client().buyerTokens.loginSettings()
          : await client().buyerTokens.setLoginSettings({ signupByLogin }),
      ),
  );
}
