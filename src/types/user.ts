export type UserRole = 'owner' | 'manager' | 'production' | 'sales' | 'store';

export type UserProfile = {
  id: string;
  email: string;
  displayName: string;
  photoUrl: string | null;
  organizationId: string;
  /** Null when Firestore role is missing or not a recognized value. */
  role: UserRole | null;
};
