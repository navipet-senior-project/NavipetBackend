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
} from '../modules/campus/campus.types.js';
import { attachIndoorDestinationIds } from '../modules/campus/campus.service.js';

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

export type OtpType = 'recovery' | 'register';

export interface VerifyOtpResult {
  tokens: LoginTokens;
}

export interface OtpVerificationGateway {
  verifyOtp(email: string, code: string, type: OtpType): Promise<VerifyOtpResult | null>;
}

export interface PasswordUpdateGateway {
  updatePassword(accessToken: string, newPassword: string): Promise<void>;
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

export interface SupabaseResources
  extends ClaimsGateway,
    PasswordLoginGateway,
    RegisterGateway,
    RefreshGateway,
    SessionRevocationGateway,
    UserLookupGateway,
    UserEmailLookupGateway,
    PasswordResetRequestGateway,
    RecoveryIntentGateway,
    OtpVerificationGateway,
    PasswordUpdateGateway,
    CampusPlacesGateway {
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
    source: string;
    metadata: Record<string, unknown>;
    active?: boolean;
    searchable?: boolean;
    rank?: number;
  }

  const campusColumns =
    'id,type,name,code,parent_destination_id,building_code,room_number,' +
    'floor_number,latitude,longitude,outdoor_destination_latitude,' +
    'outdoor_destination_longitude,source,metadata,active,searchable,' +
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
    const response = (await adminClient
      .from('destination_provider_refs')
      .select('destination_id,external_id')
      .eq('provider', 'multiset')
      .in(
        'destination_id',
        destinations.map((destination) => destination.id),
      )) as unknown as {
      data: Array<{ destination_id: string; external_id: string }> | null;
      error: Error | null;
    };
    if (response.error !== null) throw response.error;
    return attachIndoorDestinationIds(
      destinations,
      (response.data ?? []).map((reference) => ({
        destinationId: reference.destination_id,
        externalId: reference.external_id,
      })),
    );
  }

  return {
    publicClient,
    adminClient,
    forAccessToken(accessToken) {
      return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        ...noSession,
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
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
    async searchProximityDestinations(category, limit) {
      let request = publicClient
        .from('campus_destinations')
        .select(campusColumns)
        .eq('active', true)
        .eq('searchable', true);
      if (category === 'parking') {
        request = request.eq('type', 'parking');
      } else {
        request = request.contains('metadata', {
          categories: [category === 'food' ? 'dining' : category],
        });
      }
      const { data, error } = await request.limit(Math.min(limit, 100));
      if (error !== null) throw error;
      return attachIndoorReferences(
        (data as unknown as CampusDestinationRow[]).map((row) =>
          mapCampusDestination(row),
        ),
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
        .select('name')
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
    async verifyOtp(email, code, type) {
      // Supabase's own OTP type enum has no 'register' — 'signup' is its
      // equivalent for a new-account confirmation code.
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
