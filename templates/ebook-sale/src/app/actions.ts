"use server";

import { redirect } from "next/navigation";
import { infi, SLUG, PRODUCT_KEY, EBOOK } from "@/lib/infi";
import { prisma } from "@/lib/db";

export async function buyEbook(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!email.includes("@")) return;

  const products = await infi.products.list();
  const product = products.find((p) => p.key === PRODUCT_KEY);
  if (!product?.id) throw new Error("Product not seeded — run `bun run seed`.");

  // Product purchase: enrolls the customer (creates if new) + opens a
  // product-linked invoice, so the deliverable email + download grant fire on
  // payment. Price is auto-derived from the seeded product's published price.
  const { invoice, url } = await infi.checkout({
    slug: SLUG,
    productId: product.id,
    customer: { externalId: email, email, name: name || undefined },
  });

  await prisma.order.create({
    data: {
      email,
      name: name || null,
      customerId: invoice.customerId ?? "",
      invoiceId: invoice.id!,
      productId: product.id,
      status: "pending",
      checkoutUrl: url,
    },
  });

  redirect(`/thanks?invoice=${invoice.id}`);
}
