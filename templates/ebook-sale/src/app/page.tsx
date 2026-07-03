import { Check } from "lucide-react";
import { EBOOK } from "@/lib/infi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BuyForm } from "./buy-form";

const PERKS = [
  "120 páginas, direto ao ponto",
  "Checklists de validação e pricing",
  "Templates de landing e copy",
  "Acesso vitalício, sem assinatura",
];

export default function SalePage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-6 py-16 md:grid-cols-2">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Ebook</p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight md:text-5xl">
          {EBOOK.title}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">{EBOOK.subtitle}</p>
        <ul className="mt-8 space-y-3">
          {PERKS.map((p) => (
            <li key={p} className="flex items-center gap-3 text-sm">
              <Check className="size-4 text-emerald-500" /> {p}
            </li>
          ))}
        </ul>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold">R$ {EBOOK.priceBRL}</span>
            <span className="text-sm font-normal text-muted-foreground">pagamento único</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BuyForm />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Pix, boleto ou cartão. Entrega automática após o pagamento.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
