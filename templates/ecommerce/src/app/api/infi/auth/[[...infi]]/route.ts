import { auth } from "@/lib/auth";

// "Entrar com Infi": GET /api/infi/auth (who is signed in), /sign-in (go to
// Infi), /callback (Infi comes back); DELETE signs out of this site.
export const GET = auth.handle;
export const DELETE = auth.handle;
