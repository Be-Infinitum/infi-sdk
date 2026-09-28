import { notFound } from "next/navigation";
import { CheckoutFrame } from "@/components/infi/checkout-frame";
import { environment, tenantSlug } from "@/lib/infi";
import { formatPrice, getProduct } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product?.linkToken) notFound();
  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-6 pb-20 md:grid-cols-2">
      <div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">{product.name}</h1>
        {product.description ? <p className="mt-4 text-muted-foreground">{product.description}</p> : null}
        <p className="mt-6 text-2xl font-semibold">{formatPrice(product.price, product.currency)}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Pix ou cartão. {product.billingCycle ? "Cancele quando quiser em Minhas compras." : "Entrega por e-mail assim que o pagamento confirma."}
        </p>
      </div>
      <CheckoutFrame linkToken={product.linkToken} slug={tenantSlug()} environment={environment()} />
    </main>
  );
}
