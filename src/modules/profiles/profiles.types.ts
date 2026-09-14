export const ProfileRoles = ['student', 'professor'] as const;

export type ProfileRole = (typeof ProfileRoles)[number];

export interface ProfileRecord {
  displayName: string;
  email: string | null;
  role: ProfileRole | null;
}

export interface UpdateProfileInput {
  displayName?: string;
  email?: string;
  role?: ProfileRole;
}
