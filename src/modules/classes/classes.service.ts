import type { SupabaseResources } from '../../plugins/supabase.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { CampusDestinationRecord, ExternalPlacesGateway } from '../campus/campus.types.js';
import { createOutdoorFallbackResolver } from '../campus/outdoor-fallback.js';
import type { ClassRecord, CreateClassInput, UpdateClassInput } from './classes.types.js';

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

export function createClassesService(gateway: SupabaseResources, externalPlaces: ExternalPlacesGateway) {
  return {
    list: (accessToken: string) => gateway.listClasses(accessToken),
    create: async (accessToken: string, userId: string, input: CreateClassInput) => {
      const building = await resolveBuilding(gateway, externalPlaces, input.building);
      return gateway.createClass(accessToken, userId, {
        ...input,
        building: building.name,
        latitude: building.coordinates.latitude,
        longitude: building.coordinates.longitude,
      });
    },
    update: async (accessToken: string, classId: string, input: UpdateClassInput) => {
      if (input.building === undefined) return gateway.updateClass(accessToken, classId, input);
      const building = await resolveBuilding(gateway, externalPlaces, input.building);
      return gateway.updateClass(accessToken, classId, {
        ...input,
        building: building.name,
        latitude: building.coordinates.latitude,
        longitude: building.coordinates.longitude,
      });
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
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
