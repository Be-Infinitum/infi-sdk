import { StoreElement } from "@beinfi/elements-react";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function StorePage() {
  const store = await getStore();
  return (
    <main className="mx-auto max-w-5xl px-6 pb-20">
      <h1 className="mt-6 mb-10 text-4xl font-semibold tracking-tight">{store.name}</h1>
      {store.items.length === 0 ? (
        <p className="text-muted-foreground">
          A loja está vazia. Rode <code>infi sync</code> para semear o catálogo do template.
        </p>
      ) : (
        <StoreElement store={store} href={(item) => `/product/${item.productId}`} />
      )}
    </main>
  );
}
