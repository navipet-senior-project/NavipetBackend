import {
  AuthApiError,
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { AppError } from '../common/errors/app-error.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { Environment } from '../config/env.js';
import type {
  CampusCategorySearch,
  CampusDestinationRecord,
  CampusPlacesGateway,
  PublicCampusResult,
} from '../modules/campus/campus.types.js';
import {
  ACCESSIBILITY_COLUMNS,
  patchToRow,
  rowToPreferences,
  type AccessibilityPreferencesRow,
} from '../modules/accessibility/accessibility.mapping.js';
import type { AccessibilityGateway } from '../modules/accessibility/accessibility.types.js';
import { attachIndoorDestinationIds } from '../modules/campus/campus.service.js';
import { mapClassRow } from '../modules/classes/classes.service.js';
import type {
  ClassRecord,
  ClassesGateway,
} from '../modules/classes/classes.types.js';
import {
  isOwnAvatarPath,
  resolveAvatarPath,
  uploadedAvatarPath,
} from '../modules/profiles/profiles.avatar.js';
import {
  AVATAR_BUCKET,
  AVATAR_SIGNED_URL_TTL_SECONDS,
  ORPHAN_AVATAR_GRACE_PERIOD_MILLISECONDS,
} from '../modules/profiles/profiles.types.js';
import type {
  ProfileRecord,
  ProfileRole,
  UpdateProfileInput,
} from '../modules/profiles/profiles.types.js';

export const indoorDoorColumns = 'point_key,map_code,frame,floor,x,y,z,heading_deg';

interface IndoorDoorRow {
  point_key: string;
  map_code: string;
  frame: 'multiset-mapset';
  floor: string;
  x: number;
  y: number;
  z: number;
  heading_deg: number | null;
}

const noSession = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
};

const CredentialDenialCodes = new Set<string>([
  'invalid_credentials',
  'email_not_confirmed',
]);
const RecoveryIntentTtlMilliseconds = 60 * 60 * 1_000;

export interface ClaimsGateway {
  getClaims(accessToken: string): Promise<unknown>;
}

export interface PasswordCredentials {
  email: string;
  password: string;
}

export interface SignUpCredentials {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: ProfileRole;
}

export interface LoginTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PasswordLoginGateway {
  signInWithPassword(
    credentials: PasswordCredentials,
  ): Promise<LoginTokens | null>;
}

export interface SignUpResult {
  user: { id: string; email: string };
  accessToken: string | null;
  refreshToken: string | null;
}

export interface RegisterGateway {
  signUp(credentials: SignUpCredentials): Promise<SignUpResult>;
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

function sessionPurposeFromAccessToken(accessToken: string): string | undefined {
  const payload = accessToken.split('.')[1];
  if (payload === undefined) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    if (typeof claims !== 'object' || claims === null) return undefined;
    const purpose = (claims as Record<string, unknown>).session_purpose;
    return typeof purpose === 'string' ? purpose : undefined;
  } catch {
    return undefined;
  }
}

export interface RefreshGateway {
  refreshSession(refreshToken: string): Promise<RefreshedTokens>;
}

export interface PasswordResetRequestGateway {
  requestPasswordReset(email: string): Promise<void>;
}

export interface RecoveryIntentGateway {
  createRecoveryIntent(userId: string): Promise<void>;
}

export type OtpType = 'recovery' | 'register' | 'email_change';

export interface VerifyOtpResult {
  tokens: LoginTokens;
}

export interface OtpVerificationGateway {
  verifyOtp(email: string, code: string, type: OtpType): Promise<VerifyOtpResult | null>;
}

export interface PasswordUpdateGateway {
  updatePassword(accessToken: string, newPassword: string): Promise<void>;
}

export interface EmailChangeGateway {
  requestEmailChange(accessToken: string, email: string): Promise<void>;
}

export type SignOutScope = 'local' | 'global';

export interface SessionRevocationGateway {
  adminSignOut(accessToken: string, scope: SignOutScope): Promise<void>;
}

export interface UserRecord {
  id: string;
  email: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
}

export interface UserLookupGateway {
  getUserById(id: string): Promise<UserRecord | null>;
}

export interface UserEmailLookupGateway {
  findUserIdByEmail(email: string): Promise<string | null>;
}

export interface ProfileGateway {
  getProfileByUserId(accessToken: string): Promise<ProfileRecord | null>;
  updateProfile(
    accessToken: string,
    userId: string,
    input: UpdateProfileInput,
  ): Promise<ProfileRecord | null>;
  cleanupOrphanedProfileAvatars(): Promise<number>;
}

export interface RecentSearch {
  place: PublicCampusResult;
  searchedAt: string;
}

export interface RecentSearchGateway {
  saveRecentSearch(accessToken: string, place: PublicCampusResult): Promise<void>;
  listRecentSearches(accessToken: string, limit: number): Promise<RecentSearch[]>;
  clearRecentSearches(accessToken: string): Promise<void>;
}

export interface SupabaseResources
  extends ClaimsGateway,
    PasswordLoginGateway,
    RegisterGateway,
    RefreshGateway,
    SessionRevocationGateway,
    UserLookupGateway,
    UserEmailLookupGateway,
    ProfileGateway,
    PasswordResetRequestGateway,
    RecoveryIntentGateway,
    OtpVerificationGateway,
    PasswordUpdateGateway,
    EmailChangeGateway,
    CampusPlacesGateway,
    RecentSearchGateway,
    ClassesGateway,
    AccessibilityGateway {
  publicClient: SupabaseClient;
  adminClient: SupabaseClient | null;
  forAccessToken(accessToken: string): SupabaseClient;
}

export function createSupabaseResources(config: Environment): SupabaseResources {
  const publicClient = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY,
    noSession,
  );
  const adminClient =
    config.SUPABASE_SERVICE_ROLE_KEY === undefined
      ? null
      : createClient(
          config.SUPABASE_URL,
          config.SUPABASE_SERVICE_ROLE_KEY,
          noSession,
        );

  interface CampusDestinationRow {
    id: string;
    type: CampusDestinationRecord['type'];
    name: string;
    code: string | null;
    aliases?: string[];
    destination_aliases?: { alias: string }[];
    parent_destination_id: string | null;
    building_code: string | null;
    room_number: string | null;
    floor_number: string | null;
    latitude: number | null;
    longitude: number | null;
    outdoor_destination_latitude: number | null;
    outdoor_destination_longitude: number | null;
    arrival_radius_meters: number | null;
    source: string;
    metadata: Record<string, unknown>;
    active?: boolean;
    searchable?: boolean;
    rank?: number;
  }

  // The avatars bucket is backend-managed: it grants `authenticated` no
  // storage.objects policies, because the Flutter client ships the anon key
  // and must not be able to write around the size and type checks in the
  // upload route. Every avatar object operation therefore uses the service
  // role, always on a path built from the verified user id.
  function avatarStorage() {
    if (adminClient === null) {
      throw new AppError({
        code: ErrorCode.UPSTREAM_ERROR,
        statusCode: 503,
        message: 'Avatar storage unavailable',
      });
    }
    return adminClient.storage.from(AVATAR_BUCKET);
  }

  async function removeAvatarPathBestEffort(path: string): Promise<void> {
    try {
      await avatarStorage().remove([path]);
    } catch {
      // The scheduled orphan reconciliation job is the fallback.
    }
  }

  async function signAvatar(path: string): Promise<string> {
    const { data, error } = await avatarStorage().createSignedUrl(
      path,
      AVATAR_SIGNED_URL_TTL_SECONDS,
    );
    if (error !== null) throw error;
    return data.signedUrl;
  }

  // A profile read must not fail because its avatar cannot be signed (no
  // service role, missing object); the client shows a placeholder instead.
  async function profileAvatarUrl(
    userId: string,
    storedPath: string | null,
  ): Promise<string | null> {
    try {
      return await signAvatar(resolveAvatarPath(userId, storedPath));
    } catch {
      return null;
    }
  }

  const campusColumns =
    'id,type,name,code,parent_destination_id,building_code,room_number,' +
    'floor_number,latitude,longitude,outdoor_destination_latitude,' +
    'outdoor_destination_longitude,arrival_radius_meters,source,metadata,active,searchable,' +
    'destination_aliases(alias)';

  function mapCampusDestination(
    row: CampusDestinationRow,
    parentName?: string,
  ): CampusDestinationRecord {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      code: row.code,
      aliases:
        row.aliases ?? row.destination_aliases?.map(({ alias }) => alias) ?? [],
      parentDestinationId: row.parent_destination_id,
      ...(parentName === undefined ? {} : { parentName }),
      buildingCode: row.building_code,
      roomNumber: row.room_number,
      floorNumber: row.floor_number,
      latitude: row.latitude,
      longitude: row.longitude,
      outdoorDestinationLatitude: row.outdoor_destination_latitude,
      outdoorDestinationLongitude: row.outdoor_destination_longitude,
      arrivalRadiusMeters: row.arrival_radius_meters,
      source: row.source,
      active: row.active ?? true,
      searchable: row.searchable ?? true,
      metadata: row.metadata,
      rank: row.rank ?? 0,
      indoorDestinationId: null,
    };
  }

  async function attachIndoorReferences(
    destinations: CampusDestinationRecord[],
  ): Promise<CampusDestinationRecord[]> {
    if (adminClient === null || destinations.length === 0) return destinations;
    const destinationIds = destinations.map((destination) => destination.id);
    const [refsResponse, doorsResponse] = (await Promise.all([
      adminClient
        .from('destination_provider_refs')
        .select('destination_id,external_id')
        .eq('provider', 'multiset')
        .in('destination_id', destinationIds),
      adminClient
        .from('vec_destination_points')
        .select('destination_id,point_key')
        .eq('active', true)
        .in('destination_id', destinationIds),
    ])) as unknown as [
      {
        data: Array<{ destination_id: string; external_id: string }> | null;
        error: Error | null;
      },
      {
        data: Array<{ destination_id: string; point_key: string }> | null;
        error: Error | null;
      },
    ];
    if (refsResponse.error !== null) throw refsResponse.error;
    if (doorsResponse.error !== null) throw doorsResponse.error;
    // Door points go last so they win: their destination_id is a foreign key,
    // while a provider ref only names the door key as text.
    return attachIndoorDestinationIds(destinations, [
      ...(refsResponse.data ?? []).map((reference) => ({
        destinationId: reference.destination_id,
        externalId: reference.external_id,
      })),
      ...(doorsResponse.data ?? []).map((door) => ({
        destinationId: door.destination_id,
        externalId: door.point_key,
      })),
    ]);
  }

  function forAccessToken(accessToken: string) {
    return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      ...noSession,
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }

  return {
    publicClient,
    adminClient,
    forAccessToken(accessToken) {
      return forAccessToken(accessToken);
    },
    async saveRecentSearch(accessToken, place) {
      const { error } = await forAccessToken(accessToken)
        .from('recent_searches')
        .upsert(
          {
            place_id: place.id,
            type: place.type,
            title: place.title,
            subtitle: place.subtitle,
            source: place.source,
            searched_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,place_id' },
        );
      if (error !== null) throw error;
    },
    async listRecentSearches(accessToken, limit) {
      const { data, error } = await forAccessToken(accessToken)
        .from('recent_searches')
        .select('place_id,type,title,subtitle,source,searched_at')
        .order('searched_at', { ascending: false })
        .limit(Math.min(limit, 20));
      if (error !== null) throw error;
      return (data as Array<{
        place_id: string;
        type: PublicCampusResult['type'];
        title: string;
        subtitle: string;
        source: string;
        searched_at: string;
      }>).map((row) => ({
        place: {
          id: row.place_id,
          type: row.type,
          title: row.title,
          subtitle: row.subtitle,
          source: row.source,
        },
        searchedAt: row.searched_at,
      }));
    },
    async clearRecentSearches(accessToken) {
      const { error } = await forAccessToken(accessToken)
        .from('recent_searches')
        .delete()
        .gte('searched_at', '0001-01-01T00:00:00.000Z');
      if (error !== null) throw error;
    },
    async getAccessibilityPreferences(accessToken) {
      const { data, error } = await forAccessToken(accessToken)
        .from('accessibility_preferences')
        .select(ACCESSIBILITY_COLUMNS)
        .limit(1);
      if (error !== null) throw error;
      const row = (data as AccessibilityPreferencesRow[])[0];
      return row === undefined ? null : rowToPreferences(row);
    },
    async updateAccessibilityPreferences(accessToken, userId, patch) {
      const { data, error } = await forAccessToken(accessToken)
        .from('accessibility_preferences')
        .upsert({ user_id: userId, ...patchToRow(patch) }, { onConflict: 'user_id' })
        .select(ACCESSIBILITY_COLUMNS);
      if (error !== null) throw error;
      const row = (data as AccessibilityPreferencesRow[])[0];
      if (row === undefined) {
        throw new Error('Accessibility preference upsert returned no row.');
      }
      return rowToPreferences(row);
    },
    async getProfileByUserId(accessToken): Promise<ProfileRecord | null> {
      const { data, error } = await forAccessToken(accessToken)
        .from('profiles')
        .select('id,display_name,email,role,avatar_path')
        .maybeSingle();
      if (error !== null) throw error;
      if (data === null) return null;
      return {
        displayName: data.display_name as string,
        email: data.email as string | null,
        role: data.role as ProfileRecord['role'],
        avatarUrl: await profileAvatarUrl(
          data.id as string,
          data.avatar_path as string | null,
        ),
      };
    },
    async updateProfile(accessToken, userId, input): Promise<ProfileRecord | null> {
      const client = forAccessToken(accessToken);
      let newAvatarPath: string | undefined;
      let previousAvatarPath: string | null = null;
      if (input.avatar !== undefined) {
        const current = await client
          .from('profiles')
          .select('avatar_path')
          .eq('id', userId)
          .maybeSingle();
        if (current.error !== null) throw current.error;
        if (current.data === null) return null;
        previousAvatarPath = current.data.avatar_path as string | null;

        const storage = avatarStorage();
        newAvatarPath = uploadedAvatarPath(userId);
        let uploadError: Error | null;
        try {
          ({ error: uploadError } = await storage.upload(
            newAvatarPath,
            input.avatar.data,
            { contentType: input.avatar.contentType, upsert: false },
          ));
        } catch (cause) {
          await removeAvatarPathBestEffort(newAvatarPath);
          throw cause;
        }
        if (uploadError !== null) {
          // Storage may have accepted an upload even if its response was lost.
          // Best-effort compensation keeps such ambiguous failures bounded.
          await removeAvatarPathBestEffort(newAvatarPath);
          throw uploadError;
        }
      }
      const values = {
        ...(input.displayName === undefined ? {} : { display_name: input.displayName }),
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(newAvatarPath === undefined ? {} : { avatar_path: newAvatarPath }),
      };
      let data: {
        display_name: string;
        email: string | null;
        role: ProfileRole | null;
        avatar_path: string | null;
      } | null;
      let error: Error | null;
      try {
        ({ data, error } = await client
          .from('profiles')
          .update(values)
          .eq('id', userId)
          .select('display_name,email,role,avatar_path')
          .maybeSingle());
      } catch (cause) {
        if (newAvatarPath !== undefined) await removeAvatarPathBestEffort(newAvatarPath);
        throw cause;
      }
      if (newAvatarPath !== undefined) {
        if (error !== null || data === null) {
          // The profile did not commit. Remove the just-uploaded object so the
          // client can retry with its in-session copy of the file.
          await removeAvatarPathBestEffort(newAvatarPath);
        } else if (
          previousAvatarPath !== null &&
          previousAvatarPath !== newAvatarPath &&
          isOwnAvatarPath(userId, previousAvatarPath)
        ) {
          // The profile already points at the new object. Failure to remove the
          // old one is harmless; the orphan reconciliation job will retry.
          await removeAvatarPathBestEffort(previousAvatarPath);
        }
      }
      if (error !== null) throw error;
      if (data === null) return null;
      return {
        displayName: data.display_name as string,
        email: data.email as string | null,
        role: data.role as ProfileRecord['role'],
        avatarUrl: await profileAvatarUrl(userId, data.avatar_path as string | null),
      };
    },
    async cleanupOrphanedProfileAvatars() {
      if (adminClient === null) return 0;
      const storage = adminClient.storage.from(AVATAR_BUCKET);
      const cutoff = Date.now() - ORPHAN_AVATAR_GRACE_PERIOD_MILLISECONDS;
      const profiles: Array<{ avatar_path: string | null }> = [];
      for (let offset = 0; ; offset += 1_000) {
        const { data, error } = await adminClient
          .from('profiles')
          .select('avatar_path')
          .range(offset, offset + 999);
        if (error !== null) throw error;
        const rows = data ?? [];
        profiles.push(...(rows as Array<{ avatar_path: string | null }>));
        if (rows.length < 1_000) break;
      }
      const referencedPaths = new Set(
        profiles
          .map((profile) => profile.avatar_path)
          .filter((path): path is string => path !== null),
      );

      const candidates = new Set<string>();
      const collectOrphans = async (folder: string, pathPrefix: string): Promise<void> => {
        for (let offset = 0; ; offset += 1_000) {
          const { data, error } = await storage.list(folder, {
            limit: 1_000,
            offset,
          });
          if (error !== null) throw error;
          const entries = data ?? [];
          for (const entry of entries) {
            const timestamp = entry.created_at ?? entry.updated_at;
            const path = typeof entry.name === 'string'
              ? `${pathPrefix}/${entry.name}`
              : null;
            if (
              path !== null &&
              entry.id !== null &&
              !referencedPaths.has(path) &&
              typeof timestamp === 'string' &&
              Date.parse(timestamp) < cutoff
            ) {
              candidates.add(path);
            }
          }
          if (entries.length < 1_000) break;
        }
      };

      const uploadsUsers: NonNullable<Awaited<ReturnType<typeof storage.list>>['data']> = [];
      for (let offset = 0; ; offset += 1_000) {
        const { data, error } = await storage.list('uploads', { limit: 1_000, offset });
        if (error !== null) throw error;
        const entries = data ?? [];
        uploadsUsers.push(...entries);
        if (entries.length < 1_000) break;
      }
      for (const entry of uploadsUsers) {
        if (
          typeof entry.name === 'string' &&
          /^[0-9a-f-]{36}$/i.test(entry.name) &&
          entry.id === null
        ) {
          await collectOrphans(`uploads/${entry.name}`, `uploads/${entry.name}`);
        }
      }

      // Sweep legacy saved-avatar paths too, so a failed best-effort deletion
      // during migration can still be recovered by this second layer.
      const rootEntries: NonNullable<Awaited<ReturnType<typeof storage.list>>['data']> = [];
      for (let offset = 0; ; offset += 1_000) {
        const { data, error } = await storage.list('', { limit: 1_000, offset });
        if (error !== null) throw error;
        const entries = data ?? [];
        rootEntries.push(...entries);
        if (entries.length < 1_000) break;
      }
      for (const entry of rootEntries) {
        if (
          typeof entry.name === 'string' &&
          /^[0-9a-f-]{36}$/i.test(entry.name) &&
          entry.id === null
        ) {
          await collectOrphans(entry.name, entry.name);
          await collectOrphans(`${entry.name}/avatars`, `${entry.name}/avatars`);
          await collectOrphans(`${entry.name}/pending`, `${entry.name}/pending`);
        }
      }

      if (candidates.size === 0) return 0;
      const paths = [...candidates];
      for (let offset = 0; offset < paths.length; offset += 1_000) {
        const { error: removeError } = await storage.remove(paths.slice(offset, offset + 1_000));
        if (removeError !== null) throw removeError;
      }
      return paths.length;
    },
    async listClasses(accessToken): Promise<ClassRecord[]> {
      const { data, error } = await forAccessToken(accessToken)
        .from('classes')
        .select('id,course_code,course_name,building,room,weekdays,start_time,end_time,is_online,latitude,longitude,created_at,updated_at')
        .order('created_at', { ascending: true });
      if (error !== null) throw error;
      return data.map(mapClassRow);
    },
    async createClass(accessToken, userId, input): Promise<ClassRecord> {
      const { data, error } = await forAccessToken(accessToken)
        .from('classes')
        .insert({
          user_id: userId,
          course_code: input.courseCode,
          course_name: input.courseName,
          building: input.building,
          room: input.room ?? '',
          weekdays: input.weekdays,
          start_time: input.startTime,
          end_time: input.endTime,
          is_online: input.isOnline ?? false,
          latitude: input.latitude,
          longitude: input.longitude,
        })
        .select('id,course_code,course_name,building,room,weekdays,start_time,end_time,is_online,latitude,longitude,created_at,updated_at')
        .single();
      if (error !== null) throw error;
      return mapClassRow(data);
    },
    async updateClass(accessToken, classId, input): Promise<ClassRecord | null> {
      const values: Record<string, unknown> = {};
      if (input.courseCode !== undefined) values.course_code = input.courseCode;
      if (input.courseName !== undefined) values.course_name = input.courseName;
      if (input.building !== undefined) values.building = input.building;
      if (input.room !== undefined) values.room = input.room;
      if (input.weekdays !== undefined) values.weekdays = input.weekdays;
      if (input.startTime !== undefined) values.start_time = input.startTime;
      if (input.endTime !== undefined) values.end_time = input.endTime;
      if (input.isOnline !== undefined) values.is_online = input.isOnline;
      if (input.latitude !== undefined) values.latitude = input.latitude;
      if (input.longitude !== undefined) values.longitude = input.longitude;
      if (Object.keys(values).length === 0) return null;
      const { data, error } = await forAccessToken(accessToken)
        .from('classes')
        .update(values)
        .eq('id', classId)
        .select('id,course_code,course_name,building,room,weekdays,start_time,end_time,is_online,latitude,longitude,created_at,updated_at')
        .maybeSingle();
      if (error !== null) throw error;
      return data === null ? null : mapClassRow(data);
    },
    async deleteClass(accessToken, classId): Promise<boolean> {
      const { data, error } = await forAccessToken(accessToken)
        .from('classes')
        .delete()
        .eq('id', classId)
        .select('id')
        .maybeSingle();
      if (error !== null) throw error;
      return data !== null;
    },
    async searchDestinations(query, limit) {
      const response = (await publicClient.rpc(
        'search_campus_destinations',
        { search_query: query, result_limit: Math.min(limit, 50) },
      )) as unknown as {
        data: CampusDestinationRow[] | null;
        error: Error | null;
      };
      if (response.error !== null) throw response.error;
      return attachIndoorReferences(
        (response.data ?? []).map((row) => mapCampusDestination(row)),
      );
    },
    async searchCategoryDestinations(category, limit) {
      let request = publicClient
        .from('campus_destinations')
        .select(campusColumns)
        .eq('active', true)
        .eq('searchable', true);
      const metadataCategory: Partial<Record<CampusCategorySearch, string>> = {
        gender_neutral_restroom: 'gender_neutral_restroom',
        coffee: 'coffee',
        shuttle_stop: 'shuttle_stop',
        bus_stop: 'bus_stop',
        bike_rack: 'bike_rack',
        ev_charging: 'ev_charging',
      };
      if (
        category === 'visitor_parking' ||
        category === 'accessible_parking'
      ) {
        request = request.eq('type', 'parking');
      } else {
        request = request.contains('metadata', {
          categories: [metadataCategory[category]],
        });
      }
      const fetchLimit =
        category === 'visitor_parking' || category === 'accessible_parking'
          ? 50
          : Math.min(limit, 50);
      const { data, error } = await request.limit(fetchLimit);
      if (error !== null) throw error;
      return attachIndoorReferences(
        (data as unknown as CampusDestinationRow[]).map((row) =>
          mapCampusDestination(row),
        ),
      );
    },
    async listProximityDestinations() {
      const rows: CampusDestinationRow[] = [];
      const pageSize = 200;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await publicClient
          .from('campus_destinations')
          .select(campusColumns)
          .eq('active', true)
          .eq('searchable', true)
          .order('id')
          .range(from, from + pageSize - 1);
        if (error !== null) throw error;
        const page = data as unknown as CampusDestinationRow[];
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      return attachIndoorReferences(
        rows.map((row) => mapCampusDestination(row)),
      );
    },
    async findPlaceById(id) {
      const { data, error } = await publicClient
        .from('campus_destinations')
        .select(campusColumns)
        .eq('id', id)
        .eq('active', true)
        .eq('searchable', true)
        .maybeSingle();
      if (error !== null) throw error;
      if (data === null) return null;
      const [place] = await attachIndoorReferences([
        mapCampusDestination(data as unknown as CampusDestinationRow),
      ]);
      return place ?? null;
    },
    async findIndoorDoorPoint(destinationId) {
      if (adminClient === null) return null;
      // At most one row: vec_destination_points has a unique index on
      // destination_id where active.
      const { data, error } = (await adminClient
        .from('vec_destination_points')
        .select(indoorDoorColumns)
        .eq('destination_id', destinationId)
        .eq('active', true)
        .limit(1)) as unknown as { data: IndoorDoorRow[] | null; error: Error | null };
      if (error !== null) throw error;
      const [row] = data ?? [];
      if (row === undefined) return null;
      return {
        doorKey: row.point_key,
        mapCode: row.map_code,
        frame: row.frame,
        floor: row.floor,
        x: row.x,
        y: row.y,
        z: row.z,
        headingDeg: row.heading_deg,
      };
    },
    async findBuildingByCode(code) {
      const { data, error } = await publicClient
        .from('campus_destinations')
        .select(campusColumns)
        .eq('type', 'building')
        .ilike('code', code)
        .eq('active', true)
        .eq('searchable', true)
        .maybeSingle();
      if (error !== null) throw error;
      if (data === null) return null;
      const [building] = await attachIndoorReferences([
        mapCampusDestination(data as unknown as CampusDestinationRow),
      ]);
      return building ?? null;
    },
    async searchBuildingRooms(buildingId, query, limit) {
      const buildingResponse = (await publicClient
        .from('campus_destinations')
        .select('name,arrival_radius_meters')
        .eq('id', buildingId)
        .eq('type', 'building')
        .eq('active', true)
        .eq('searchable', true)
        .maybeSingle()) as unknown as {
        data: { name: string } | null;
        error: Error | null;
      };
      if (buildingResponse.error !== null) throw buildingResponse.error;
      if (buildingResponse.data === null) return [];
      const { data, error } = await publicClient
        .from('campus_destinations')
        .select(campusColumns)
        .eq('type', 'room')
        .eq('parent_destination_id', buildingId)
        .eq('active', true)
        .eq('searchable', true)
        .ilike('room_number', `${query}%`)
        .order('room_number')
        .limit(Math.min(limit, 50));
      if (error !== null) throw error;
      const parentName = buildingResponse.data.name;
      return attachIndoorReferences(
        (data as unknown as CampusDestinationRow[]).map((row) =>
          mapCampusDestination(row, parentName),
        ),
      );
    },
    async searchBuildingChildren(buildingId, category, limit) {
      let request = publicClient
        .from('campus_destinations')
        .select(campusColumns)
        .eq('parent_destination_id', buildingId)
        .eq('active', true)
        .eq('searchable', true);
      if (category === 'accessible_entrance') {
        request = request.eq('type', 'entrance');
      } else {
        request = request.contains('metadata', { categories: [category] });
      }
      const { data, error } = await request.limit(Math.min(limit, 50));
      if (error !== null) throw error;
      return attachIndoorReferences(
        (data as unknown as CampusDestinationRow[]).map((row) =>
          mapCampusDestination(row),
        ),
      );
    },
    async getClaims(accessToken) {
      const { data, error } = await publicClient.auth.getClaims(accessToken);
      if (error !== null) throw error;
      return data?.claims ?? null;
    },
    async signInWithPassword(credentials) {
      const loginClient = createClient(
        config.SUPABASE_URL,
        config.SUPABASE_ANON_KEY,
        noSession,
      );
      const { data, error } = await loginClient.auth.signInWithPassword(
        credentials,
      );
      if (error !== null) {
        if (
          error.code !== undefined &&
          CredentialDenialCodes.has(error.code)
        ) {
          return null;
        }
        throw error;
      }
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    },
    async signUp(credentials) {
      const signUpClient = createClient(
        config.SUPABASE_URL,
        config.SUPABASE_ANON_KEY,
        noSession,
      );
      const { data, error } = await signUpClient.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            first_name: credentials.firstName,
            last_name: credentials.lastName,
            display_name: `${credentials.firstName} ${credentials.lastName}`,
            role: credentials.role,
          },
        },
      });
      if (error !== null) throw error;
      if (data.user === null) {
        throw new Error('Supabase signUp did not return a user');
      }
      return {
        user: { id: data.user.id, email: data.user.email ?? credentials.email },
        accessToken: data.session?.access_token ?? null,
        refreshToken: data.session?.refresh_token ?? null,
      };
    },
    async refreshSession(refreshToken) {
      const refreshClient = createClient(
        config.SUPABASE_URL,
        config.SUPABASE_ANON_KEY,
        noSession,
      );
      const { data, error } = await refreshClient.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (error !== null) throw error;
      if (data.session === null) {
        throw new Error('Supabase refreshSession did not return a session');
      }
      if (sessionPurposeFromAccessToken(data.session.access_token) !== 'standard') {
        const error = new Error('Refresh is not allowed for this session purpose');
        Object.assign(error, { code: 'session_purpose_not_refreshable' });
        throw error;
      }
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        userId: data.session.user.id,
      };
    },
    async adminSignOut(accessToken, scope) {
      if (adminClient === null) {
        throw new AppError({
          code: ErrorCode.UPSTREAM_ERROR,
          statusCode: 503,
          message: 'Admin operations unavailable',
        });
      }
      const { error } = await adminClient.auth.admin.signOut(accessToken, scope);
      if (error !== null && error.code !== 'session_not_found') {
        throw error;
      }
    },
    async findUserIdByEmail(email) {
      if (adminClient === null) {
        throw new AppError({
          code: ErrorCode.UPSTREAM_ERROR,
          statusCode: 503,
          message: 'Admin operations unavailable',
        });
      }
      const normalized = email.toLowerCase();
      const perPage = 1000;
      for (let page = 1; ; page += 1) {
        const { data, error } = await adminClient.auth.admin.listUsers({
          page,
          perPage,
        });
        if (error !== null) throw error;
        const match = data.users.find(
          (user) => (user.email ?? '').toLowerCase() === normalized,
        );
        if (match !== undefined) return match.id;
        if (data.users.length < perPage) return null;
      }
    },
    async requestPasswordReset(email) {
      const { error } = await publicClient.auth.resetPasswordForEmail(email);
      if (error !== null) throw error;
    },
    async createRecoveryIntent(userId) {
      if (adminClient === null) {
        throw new AppError({
          code: ErrorCode.UPSTREAM_ERROR,
          statusCode: 503,
          message: 'Admin operations unavailable',
        });
      }
      const { error } = await adminClient.from('auth_recovery_intents').upsert(
        {
          user_id: userId,
          expires_at: new Date(Date.now() + RecoveryIntentTtlMilliseconds).toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error !== null) throw error;
    },
    async requestEmailChange(accessToken, email) {
      const response = await fetch(
        new URL('/auth/v1/user', config.SUPABASE_URL).toString(),
        {
          method: 'PUT',
          headers: {
            apikey: config.SUPABASE_ANON_KEY,
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ email }),
        },
      );
      if (!response.ok) {
        let body: { code?: unknown; error_code?: unknown; message?: unknown; msg?: unknown } = {};
        try {
          body = (await response.json()) as typeof body;
        } catch {
          // Proxies can return an empty or non-JSON error response.
        }
        const error = new Error(
          typeof body.msg === 'string'
            ? body.msg
            : typeof body.message === 'string'
              ? body.message
              : response.statusText,
        );
        Object.assign(error, {
          code: typeof body.code === 'string'
            ? body.code
            : typeof body.error_code === 'string'
              ? body.error_code
              : undefined,
          status: response.status,
        });
        throw error;
      }
    },
    async verifyOtp(email, code, type) {
      // Supabase's own OTP type enum has no 'register' — 'signup' is its
      // equivalent for a new-account confirmation code. 'recovery' and
      // 'email_change' already match Supabase's names.
      const supabaseType = type === 'register' ? 'signup' : type;
      const { data, error } = await publicClient.auth.verifyOtp({
        email,
        token: code,
        type: supabaseType,
      });
      if (error !== null) {
        if (error.code === 'otp_expired') return null;
        throw error;
      }
      if (data.session === null) {
        throw new Error('Supabase verifyOtp did not return a session');
      }
      return {
        tokens: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        },
      };
    },
    async updatePassword(accessToken, newPassword) {
      const response = await fetch(
        new URL('/auth/v1/user', config.SUPABASE_URL).toString(),
        {
          method: 'PUT',
          headers: {
            apikey: config.SUPABASE_ANON_KEY,
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ password: newPassword }),
        },
      );
      if (!response.ok) {
        let body: {
          code?: unknown;
          error?: unknown;
          error_code?: unknown;
          error_description?: unknown;
          message?: unknown;
          msg?: unknown;
        } = {};
        try {
          body = (await response.json()) as typeof body;
        } catch {
          // Proxies can return an empty or non-JSON error response.
        }
        const code =
          typeof body.code === 'string'
            ? body.code
            : typeof body.error_code === 'string'
              ? body.error_code
              : undefined;
        const message =
          typeof body.msg === 'string'
            ? body.msg
            : typeof body.message === 'string'
              ? body.message
              : typeof body.error_description === 'string'
                ? body.error_description
                : typeof body.error === 'string'
                  ? body.error
                  : response.statusText || 'Supabase password update failed';
        throw new AuthApiError(message, response.status, code);
      }
    },
    async getUserById(id) {
      if (adminClient === null) {
        throw new AppError({
          code: ErrorCode.UPSTREAM_ERROR,
          statusCode: 503,
          message: 'Admin operations unavailable',
        });
      }
      const { data, error } = await adminClient.auth.admin.getUserById(id);
      if (error !== null) {
        if (error.code === 'user_not_found') return null;
        throw error;
      }
      return {
        id: data.user.id,
        email: data.user.email ?? '',
        status: data.user.banned_until === undefined ? 'ACTIVE' : 'DISABLED',
        createdAt: data.user.created_at,
      };
    },
  };
}

export interface SupabasePluginOptions {
  resources?: SupabaseResources;
}

const supabasePlugin: FastifyPluginAsync<SupabasePluginOptions> = (
  fastify,
  options,
) => {
  fastify.decorate(
    'supabase',
    options.resources ?? createSupabaseResources(fastify.config),
  );
  return Promise.resolve();
};

export default fp(supabasePlugin, {
  fastify: '5.x',
  name: 'app-supabase',
});
