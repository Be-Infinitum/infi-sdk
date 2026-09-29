import { OrderStatus } from "@/components/order-status";

export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  return (
    <main className="mx-auto max-w-xl px-6 pb-20 text-center">
      <h1 className="mt-10 text-3xl font-semibold">Obrigado!</h1>
      {order ? <OrderStatus orderId={order} /> : null}
    </main>
  );
}
