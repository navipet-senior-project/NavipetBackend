import type { SupabaseResources } from '../../plugins/supabase.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { CampusDestinationRecord, ExternalPlacesGateway } from '../campus/campus.types.js';
import { createOutdoorFallbackResolver } from '../campus/outdoor-fallback.js';
import { findClassConflicts, findDuplicateClass, type ClassSchedule } from './class-conflicts.js';
import { parseClockTime, parseCsulbTimeRange } from './class-times.js';
import type {
  ClassRecord,
  ClassTimeRequest,
  CreateClassInput,
  CreateClassRequest,
  UpdateClassInput,
  UpdateClassRequest,
} from './classes.types.js';

/** Raised by the `classes_prevent_time_conflict` trigger (exclusion_violation). */
const TIME_CONFLICT_SQLSTATE = '23P01';

function withSeconds(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

function validateTimeOrder(startTime: string | undefined, endTime: string | undefined): void {
  if (startTime === undefined || endTime === undefined) return;
  if (withSeconds(endTime) <= withSeconds(startTime)) {
    throw new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      statusCode: 422,
      message: 'End time must be later than start time.',
    });
  }
}

function invalidTime(message: string): AppError {
  return new AppError({ code: ErrorCode.VALIDATION_ERROR, statusCode: 422, message });
}

function clockTime(value: string, field: 'startTime' | 'endTime'): string {
  const parsed = parseClockTime(value);
  if (parsed === null) throw invalidTime(`\`${field}\` is not a recognized time.`);
  return parsed;
}

/**
 * Normalizes whichever time form the client sent to 24-hour start/end.
 * Omitted fields stay omitted, so a partial update only touches what it sent.
 */
function normalizeTimes(request: ClassTimeRequest): { startTime?: string; endTime?: string } {
  if (request.time === undefined) {
    return {
      ...(request.startTime === undefined ? {} : { startTime: clockTime(request.startTime, 'startTime') }),
      ...(request.endTime === undefined ? {} : { endTime: clockTime(request.endTime, 'endTime') }),
    };
  }
  if (request.startTime !== undefined || request.endTime !== undefined) {
    throw invalidTime('Send either `time` or `startTime`/`endTime`, not both.');
  }
  const range = parseCsulbTimeRange(request.time);
  if (range === null) throw invalidTime('`time` is not a recognized or unambiguous time range.');
  if (range.kind === 'unscheduled') {
    throw invalidTime('Classes without a scheduled meeting time (NA/NA) are not supported.');
  }
  return { startTime: range.startTime, endTime: range.endTime };
}

function toCreateInput(request: CreateClassRequest): CreateClassInput {
  const { startTime, endTime } = normalizeTimes(request);
  if (startTime === undefined || endTime === undefined) {
    throw invalidTime('Send `time`, or both `startTime` and `endTime`.');
  }
  return {
    courseCode: request.courseCode,
    courseName: request.courseName,
    building: request.building,
    ...(request.room === undefined ? {} : { room: request.room }),
    weekdays: request.weekdays,
    startTime,
    endTime,
  };
}

function toUpdateInput(request: UpdateClassRequest): UpdateClassInput {
  return {
    ...(request.courseCode === undefined ? {} : { courseCode: request.courseCode }),
    ...(request.courseName === undefined ? {} : { courseName: request.courseName }),
    ...(request.building === undefined ? {} : { building: request.building }),
    ...(request.room === undefined ? {} : { room: request.room }),
    ...(request.weekdays === undefined ? {} : { weekdays: request.weekdays }),
    ...normalizeTimes(request),
  };
}

function coordinatePair(building: CampusDestinationRecord): { latitude: number; longitude: number } | null {
  const latitude = building.outdoorDestinationLatitude ?? building.latitude;
  const longitude = building.outdoorDestinationLongitude ?? building.longitude;
  return latitude !== null && longitude !== null
    ? { latitude, longitude }
    : null;
}

async function resolveCsulbBuilding(
  gateway: SupabaseResources,
  query: string,
): Promise<CampusDestinationRecord | undefined> {
  const codeBuilding = await gateway.findBuildingByCode(query.toLocaleUpperCase('en-US'));
  const results = codeBuilding === null ? await gateway.searchDestinations(query, 20) : [];
  const buildings = codeBuilding === null
    ? results.filter((result) => result.type === 'building')
    : [codeBuilding];
  const normalized = query.toLocaleLowerCase('en-US');
  return buildings.find((result) =>
    result.name.toLocaleLowerCase('en-US') === normalized ||
    result.code?.toLocaleLowerCase('en-US') === normalized ||
    result.buildingCode?.toLocaleLowerCase('en-US') === normalized,
  ) ?? (buildings.length === 1 ? buildings[0] : undefined);
}

async function resolveBuilding(
  gateway: SupabaseResources,
  externalPlaces: ExternalPlacesGateway,
  buildingInput: string,
): Promise<{ name: string; coordinates: { latitude: number; longitude: number } }> {
  const query = buildingInput.trim();
  const building = await resolveCsulbBuilding(gateway, query);
  if (building !== undefined) {
    const outdoorFallback = createOutdoorFallbackResolver(externalPlaces);
    const coordinates = coordinatePair(building) ?? (await outdoorFallback.resolve(building));
    if (coordinates === null) {
      throw new AppError({ code: ErrorCode.UPSTREAM_ERROR, statusCode: 502, message: 'CSULB building has no coordinates.' });
    }
    return { name: building.name, coordinates };
  }

  // Not a known CSULB building: the client may have supplied a plain address
  // (e.g. an internship site or another campus), so fall back to Mapbox
  // forward geocoding the same way the recent-searches/campus autocomplete does.
  const [external] = await externalPlaces.searchExternalPlaces(query, 1);
  if (external === undefined) {
    throw new AppError({ code: ErrorCode.NOT_FOUND, statusCode: 404, message: 'Building or address not found.' });
  }
  return { name: external.name, coordinates: { latitude: external.latitude, longitude: external.longitude } };
}

function isTimeConflictViolation(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === TIME_CONFLICT_SQLSTATE;
}

function assertSchedulable(schedule: ClassSchedule, existing: readonly ClassRecord[], ignoreClassId?: string): void {
  const duplicate = findDuplicateClass(schedule, existing, ignoreClassId);
  if (duplicate !== undefined) {
    throw new AppError({
      code: ErrorCode.DUPLICATE_CLASS,
      statusCode: 409,
      message: 'This class is already on your schedule.',
      details: { existingClassId: duplicate.id },
    });
  }
  const conflicts = findClassConflicts(schedule, existing, ignoreClassId);
  if (conflicts.length > 0) throw timeConflictError(conflicts);
}

function timeConflictError(conflicts: ReturnType<typeof findClassConflicts>, cause?: unknown): AppError {
  return new AppError({
    code: ErrorCode.CLASS_TIME_CONFLICT,
    statusCode: 409,
    message: 'This class conflicts with an existing class.',
    details: { conflicts },
    ...(cause === undefined ? {} : { cause }),
  });
}

export function createClassesService(gateway: SupabaseResources, externalPlaces: ExternalPlacesGateway) {
  /**
   * The service check produces the detailed 409. The database trigger is the
   * race-proof backstop: two concurrent requests can both pass the service
   * check, but the trigger serializes them per user and rejects the loser.
   */
  async function persistOrExplainConflict<T>(
    accessToken: string,
    schedule: ClassSchedule,
    ignoreClassId: string | undefined,
    write: () => Promise<T>,
  ): Promise<T> {
    try {
      return await write();
    } catch (cause) {
      if (!isTimeConflictViolation(cause)) throw cause;
      const current = await gateway.listClasses(accessToken);
      throw timeConflictError(findClassConflicts(schedule, current, ignoreClassId), cause);
    }
  }

  return {
    list: (accessToken: string) => gateway.listClasses(accessToken),
    create: async (accessToken: string, userId: string, request: CreateClassRequest) => {
      const input = toCreateInput(request);
      validateTimeOrder(input.startTime, input.endTime);
      assertSchedulable(input, await gateway.listClasses(accessToken));
      const building = await resolveBuilding(gateway, externalPlaces, input.building);
      return persistOrExplainConflict(accessToken, input, undefined, () =>
        gateway.createClass(accessToken, userId, {
          ...input,
          building: building.name,
          latitude: building.coordinates.latitude,
          longitude: building.coordinates.longitude,
        }),
      );
    },
    update: async (accessToken: string, classId: string, request: UpdateClassRequest) => {
      const input = toUpdateInput(request);
      validateTimeOrder(input.startTime, input.endTime);
      const touchesSchedule = input.courseCode !== undefined || input.weekdays !== undefined ||
        input.startTime !== undefined || input.endTime !== undefined;
      let schedule: ClassSchedule | undefined;
      if (touchesSchedule) {
        const existing = await gateway.listClasses(accessToken);
        const stored = existing.find((record) => record.id === classId);
        if (stored === undefined) return null;
        schedule = {
          courseCode: input.courseCode ?? stored.courseCode,
          weekdays: input.weekdays ?? stored.weekdays,
          startTime: input.startTime ?? stored.startTime,
          endTime: input.endTime ?? stored.endTime,
        };
        validateTimeOrder(schedule.startTime, schedule.endTime);
        assertSchedulable(schedule, existing, classId);
      }
      const values = input.building === undefined
        ? input
        : await resolveBuilding(gateway, externalPlaces, input.building).then((building) => ({
          ...input,
          building: building.name,
          latitude: building.coordinates.latitude,
          longitude: building.coordinates.longitude,
        }));
      const write = () => gateway.updateClass(accessToken, classId, values);
      return schedule === undefined ? write() : persistOrExplainConflict(accessToken, schedule, classId, write);
    },
    delete: (accessToken: string, classId: string) => gateway.deleteClass(accessToken, classId),
  };
}

export function mapClassRow(row: Record<string, unknown>): ClassRecord {
  return {
    id: row.id as string,
    courseCode: row.course_code as string,
    courseName: row.course_name as string,
    building: row.building as string,
    room: row.room as string,
    weekdays: row.weekdays as number[],
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
