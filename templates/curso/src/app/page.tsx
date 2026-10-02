import { StoreElement } from "@beinfi/elements-react";
import Link from "next/link";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The sales page: the course and its two ways in, from the Infi storefront. */
export default async function SalesPage() {
  const store = await getStore();
  return (
    <main className="mx-auto max-w-5xl px-6 pb-20">
      <section className="mt-10 mb-12">
        <h1 className="text-4xl font-semibold tracking-tight">{store.name}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
          Aulas curtas, no seu ritmo, em qualquer aparelho. Você continua de onde parou.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Já é aluno? <Link href="/membros" className="underline">Entre na área de membros</Link>.
        </p>
      </section>
      {store.items.length === 0 ? (
        <p className="text-muted-foreground">
          A loja está vazia. Rode <code>infi sync</code> e depois <code>npm run infi:seed</code>.
        </p>
      ) : (
        <StoreElement store={store} href={(item) => `/produto/${item.productId}`} buyLabel="Quero o curso" subscribeLabel="Assinar" />
      )}
    </main>
  );
}
