export const ProfileRoles = ['student', 'professor'] as const;

export type ProfileRole = (typeof ProfileRoles)[number];

export const AVATAR_BUCKET = 'avatars';
export const DEFAULT_AVATAR_PATH = 'defaults/avatar.webp';
export const AVATAR_FIELD_NAME = 'avatar';
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const ORPHAN_AVATAR_GRACE_PERIOD_MILLISECONDS = 24 * 60 * 60 * 1_000;

export interface ProfileRecord {
  displayName: string;
  email: string | null;
  role: ProfileRole | null;
  avatarUrl: string | null;
}

export interface UpdateProfileInput {
  displayName?: string;
  role?: ProfileRole;
  avatar?: {
    contentType: import('./profiles.avatar.js').AvatarContentType;
    data: Buffer;
  };
}
