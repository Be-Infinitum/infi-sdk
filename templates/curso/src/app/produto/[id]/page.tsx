import { formatPrice } from "@beinfi/elements-react";
import { notFound } from "next/navigation";
import { Checkout } from "@/components/checkout";
import { getStore, linkFor } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = (await getStore()).items.find((i) => i.productId === id);
  const linkToken = product ? await linkFor(product.productId) : undefined;
  if (!product || !linkToken) notFound();
  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-6 pb-20 md:grid-cols-2">
      <div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">{product.name}</h1>
        {product.description ? <p className="mt-4 text-muted-foreground">{product.description}</p> : null}
        <p className="mt-6 text-2xl font-semibold">{formatPrice(product.price, product.currency)}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Pix ou cartão.{" "}
          {product.billingCycle ? "Acesso enquanto a assinatura estiver ativa. Cancele quando quiser em Minhas compras." : "Acesso liberado na área de membros assim que o pagamento confirma."}
        </p>
      </div>
      <Checkout linkToken={linkToken} />
    </main>
  );
}
