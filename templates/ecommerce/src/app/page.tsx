import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { formatPrice, listProducts } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function StorePage() {
  const { name, products } = await listProducts();
  return (
    <main className="mx-auto max-w-5xl px-6 pb-20">
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">{name}</h1>
      {products.length === 0 ? (
        <p className="mt-8 text-muted-foreground">
          A loja está vazia. Rode <code>infi sync</code> para semear o catálogo do template.
        </p>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {products.map((p) => (
            <Card key={p.productId} className="flex flex-col">
              <CardTitle>{p.name}</CardTitle>
              {p.description ? <p className="mt-2 text-sm text-muted-foreground">{p.description}</p> : null}
              <p className="mt-6 text-2xl font-semibold">
                {formatPrice(p.price, p.currency)}
                {p.billingCycle === "monthly" ? <span className="text-sm font-normal text-muted-foreground"> /mês</span> : null}
              </p>
              <Button asChild className="mt-6">
                <Link href={`/produto/${p.productId}`}>{p.billingCycle ? "Assinar" : "Comprar"}</Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
