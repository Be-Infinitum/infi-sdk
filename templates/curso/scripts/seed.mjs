// `npm run infi:seed` — after `infi sync`: the access key, what each product
// grants, and the course from curso.seed.json. Run it once per mode. It stops
// before touching a course that already exists: from then on the course is
// edited through the API (dashboard, CLI, or your AI via the Infi MCP).
import { readFileSync } from "node:fs";
import { Infi } from "@beinfi/sdk";

const key = process.env.INFI_SECRET_KEY;
if (!key?.startsWith("sk_")) {
  console.error("INFI_SECRET_KEY is missing. Run `infi login` in this folder first.");
  process.exit(1);
}
const infi = new Infi({ secretKey: key, apiUrl: process.env.INFI_API_URL });
const seed = JSON.parse(readFileSync(new URL("../curso.seed.json", import.meta.url), "utf8"));

const keys = await infi.access.listKeys();
if (!keys.some((k) => k.key === seed.accessKey.key)) {
  await infi.access.createKey(seed.accessKey);
  console.log(`chave de acesso "${seed.accessKey.key}" criada`);
}

const products = await infi.products.list();
for (const g of seed.grants) {
  const product = products.find((p) => p.key === g.product);
  if (!product) {
    console.error(`produto ${g.product} não encontrado — rode \`infi sync\` antes`);
    process.exit(1);
  }
  await infi.access.setProductRules(product.id, [{ key: seed.accessKey.key, window: g.window, days: g.days }]);
  console.log(`${g.product} libera "${seed.accessKey.key}" (${g.window})`);
}

const courses = await infi.courses.list();
if (courses.some((c) => c.accessKey === seed.accessKey.key)) {
  console.log("o curso já existe; edite-o pela API (painel, CLI ou MCP)");
  process.exit(0);
}
const { modules, ...fields } = seed.course;
const course = await infi.courses.create({
  ...fields,
  coverUrl: fields.coverUrl || undefined,
  accessKey: seed.accessKey.key,
  published: true,
});
for (const m of modules) {
  const mod = await infi.courses.createModule(course.id, m.title);
  for (const l of m.lessons) await infi.courses.createLesson(course.id, { ...l, moduleId: mod.id });
}
console.log(`curso "${course.title}" criado (${course.id})`);
