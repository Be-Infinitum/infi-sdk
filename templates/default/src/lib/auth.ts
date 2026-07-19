import { redirect } from "next/navigation";
import { getSession } from "@beinfi/nextjs";
import { infi, productId, STARTER_CREDITS } from "./infi";
import { prisma } from "./db";
import type { UserProfile } from "@/generated/prisma";

export type AppUser = UserProfile & {
  customerId: string;
  enrollmentId: string;
  email: string | null;
};

/**
 * Resolve the signed-in user, enroll in the starter product on first login,
 * and grant starter credits once.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  const session = await getSession({
    secretKey: process.env.INFI_SECRET_KEY!,
    apiUrl: process.env.INFI_API_URL,
  });
  if (!session?.customer?.id) return null;

  const customerId = session.customer.id;
  const email = session.customer.email ?? session.identity?.email ?? null;

  let profile = await prisma.userProfile.findUnique({ where: { id: customerId } });

  if (!profile?.enrollmentId) {
    const pid = await productId();
    const enrollment = await infi.products.enroll(pid, {
      externalId: customerId,
      email: email ?? undefined,
    });
    const enrollmentId = enrollment.id!;
    profile = await prisma.userProfile.upsert({
      where: { id: customerId },
      create: { id: customerId, email, enrollmentId },
      update: { email: email ?? undefined, enrollmentId },
    });
    await infi.customers.credits
      .grant(enrollmentId, { amount: STARTER_CREDITS, reference: "starter" })
      .catch(() => {});
  } else if (profile.email !== email) {
    profile = await prisma.userProfile.update({
      where: { id: customerId },
      data: { email: email ?? undefined },
    });
  }

  return {
    ...profile,
    customerId,
    enrollmentId: profile.enrollmentId!,
    email,
  };
}

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOnboardedUser(): Promise<AppUser> {
  const user = await requireUser();
  if (!user.onboardingComplete) redirect("/onboarding");
  return user;
}

export async function completeOnboarding(userId: string): Promise<void> {
  await prisma.userProfile.update({
    where: { id: userId },
    data: { onboardingComplete: true },
  });
}
