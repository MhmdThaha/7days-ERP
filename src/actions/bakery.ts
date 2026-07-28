'use server';

import { createBakeryFormSchema } from '@/lib/auth/schemas/create-bakery.schema';
import { getAuthenticatedUserId } from '@/lib/firebase/auth-server';
import { userRepository } from '@/lib/repositories/user.repository';
import { wrapAction, type ActionResult } from '@/lib/utils/action-result';
import type { UserProfile } from '@/types/user';

export async function getUserProfileAction(): Promise<ActionResult<UserProfile | null>> {
  return wrapAction(async () => {
    const userId = await getAuthenticatedUserId();
    return userRepository.getById(userId);
  });
}

export async function createBakeryAction(input: {
  bakeryName: string;
  email: string;
  displayName: string;
}): Promise<ActionResult<UserProfile>> {
  return wrapAction(async () => {
    const userId = await getAuthenticatedUserId();
    const validated = createBakeryFormSchema.parse({
      bakeryName: input.bakeryName,
    });

    return userRepository.createOwnerBakery({
      uid: userId,
      email: input.email,
      displayName: input.displayName,
      bakeryName: validated.bakeryName,
    });
  });
}
