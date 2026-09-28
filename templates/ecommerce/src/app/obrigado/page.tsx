import { OrderStatus } from "@/components/infi/order-status";

export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const { pedido } = await searchParams;
  return (
    <main className="mx-auto max-w-xl px-6 pb-20 text-center">
      <h1 className="mt-10 text-3xl font-semibold">Obrigado!</h1>
      {pedido ? <OrderStatus orderId={pedido} /> : null}
    </main>
  );
}
