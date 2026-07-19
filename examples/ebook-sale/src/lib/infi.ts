import { Infi } from "@beinfi/sdk";

export const infi = new Infi({
  secretKey: process.env.INFI_SECRET_KEY!,
  apiUrl: process.env.INFI_API_URL,
  appUrl: process.env.INFI_PAY_BASE_URL,
});

export const SLUG = process.env.INFI_SLUG ?? "ebook-demo";
export const PRODUCT_KEY = "ebook-lean-side-project";
export const EBOOK = {
  title: "The Lean Side Project",
  subtitle: "Ship a paid product in a weekend.",
  priceBRL: process.env.EBOOK_PRICE_BRL ?? "49.00",
  downloadUrl: process.env.EBOOK_DOWNLOAD_URL ?? "https://example.com/ebook.pdf",
};
