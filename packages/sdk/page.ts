import { readFile } from "node:fs/promises";
import { Infi } from "@beinfi/sdk";
declare const infi: Infi;
declare const productId: string, invoiceId: string, slug: string, pedidoId: string;
declare function mostrarBotao(url: string): void;
async function bloco0() {
await infi.products.deliverable.save(productId, {
  kind: "link",
  url: "https://seusite.com/area-de-membros/guia",
});
}
void bloco0;

async function bloco1() {

const bytes = await readFile("./guia-do-cafe.pdf");

// 1. peça a URL assinada
const { uploadUrl, objectKey } = await infi.products.deliverable.presign(productId, {
  fileName: "guia-do-cafe.pdf",
  contentType: "application/pdf",
  sizeBytes: bytes.byteLength,
});

// 2. suba os bytes pra ela (PUT, sem header de auth nosso)
await fetch(uploadUrl, {
  method: "PUT",
  headers: { "Content-Type": "application/pdf" },
  body: bytes,
});

// 3. registre o objeto no produto
await infi.products.deliverable.save(productId, { kind: "file", objectKey });
}
void bloco1;

async function bloco2() {
const grants = await infi.invoices.deliverable(invoiceId);
// [{ paymentId, token, downloadUrl, emailSentAt, createdAt }]

if (grants.length > 0) {
  mostrarBotao(grants[0].downloadUrl);   // sua página de obrigado
}
}
void bloco2;

async function bloco3() {
await infi.products.deliverable.get(productId);      // o que está anexado hoje
await infi.products.deliverable.save(productId, { kind: "link", url: "https://x/y" }); // substitui
await infi.products.deliverable.delete(productId);    // remove (idempotente)
}
void bloco3;

async function bloco4() {

// uma vez, ao cadastrar o produto
await infi.products.deliverable.save(productId, {
  kind: "link",
  url: "https://seusite.com/guia.pdf",
});

// a cada venda
const { invoiceId } = await infi.checkout({
  slug,
  productId,
  customer: { externalId: "u_1", email: "comprador@x.com", taxId: "52998224725" },
  idempotencyKey: `venda:${pedidoId}`,
});

const pago = await infi.pay.waitForPaid({ slug, invoiceId });
if (pago) {
  const [grant] = await infi.invoices.deliverable(invoiceId);
  return { download: grant?.downloadUrl };   // sua página de obrigado
}
}
void bloco4;
