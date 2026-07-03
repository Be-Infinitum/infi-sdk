import { OrderStatus } from "./order-status";

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>;
}) {
  const { invoice } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      {invoice ? (
        <OrderStatus invoiceId={invoice} />
      ) : (
        <p className="text-muted-foreground">Pedido não encontrado.</p>
      )}
    </main>
  );
}
