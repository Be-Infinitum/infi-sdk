import { auth } from "@/lib/auth";

// GET: who is signed in · POST: <LoginElement> hands over the token · DELETE: sign out.
export const { GET, POST, DELETE } = auth.handlers;
