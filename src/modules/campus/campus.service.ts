import type {
  CampusCategorySearch,
  CampusDestinationRecord,
  CampusPlacesGateway,
  CampusSearchResponse,
  ContainedDestinationCategory,
  ExternalPlacesGateway,
  PublicCampusResult,
} from './campus.types.js';

interface RoomIntent {
  buildingQuery: string;
  roomNumber: string;
}

interface ContainedIntent {
  buildingQuery: string;
  category: ContainedDestinationCategory;
}

export interface NormalizedCampusQuery {
  display: string;
  normalized: string;
  meaningfulLength: number;
  roomIntent: RoomIntent | null;
}

interface CampusServiceDependencies {
  campusPlaces: CampusPlacesGateway;
  externalPlaces: ExternalPlacesGateway;
}

export function attachIndoorDestinationIds(
  destinations: CampusDestinationRecord[],
  references: ReadonlyArray<{ destinationId: string; externalId: string }>,
): CampusDestinationRecord[] {
  const byDestination = new Map(
    references.map((reference) => [reference.destinationId, reference.externalId]),
  );
  return destinations.map((destination) => ({
    ...destination,
    indoorDestinationId:
      byDestination.get(destination.id) ?? destination.indoorDestinationId,
  }));
}

const CategoryQueries: Readonly<Record<string, CampusCategorySearch>> = {
  'visitor parking': 'visitor_parking',
  'accessible parking': 'accessible_parking',
  'gender neutral restroom': 'gender_neutral_restroom',
  coffee: 'coffee',
  'shuttle stop': 'shuttle_stop',
  'bus stop': 'bus_stop',
  'bike rack': 'bike_rack',
  'ev charging': 'ev_charging',
};

// Verified CSULB intent names whose canonical destination uses a different
// current display name. Keep destination ownership in the database by
// resolving these intents to stable building codes.
const DirectBuildingIntents: Readonly<Record<string, string>> = {
  'walter pyramid': 'PYR',
  'financial aid': 'BH',
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function matchesCategory(
  destination: CampusDestinationRecord,
  category: CampusCategorySearch,
): boolean {
  const categories = stringArray(destination.metadata.categories);
  switch (category) {
    case 'visitor_parking':
      return (
        categories.some((value) => value.startsWith('parking_')) &&
        destination.metadata.parking_class === 'visitor'
      );
    case 'accessible_parking':
      return (
        categories.includes('accessible_parking') ||
        (categories.some((value) => value.startsWith('parking_')) &&
          destination.metadata.accessible === true)
      );
    case 'gender_neutral_restroom':
      return categories.includes('gender_neutral_restroom');
    case 'coffee':
      return categories.includes('coffee');
    case 'shuttle_stop':
      return categories.includes('shuttle_stop');
    case 'bus_stop':
      return categories.includes('bus_stop');
    case 'bike_rack':
      return categories.includes('bike_rack');
    case 'ev_charging':
      return categories.includes('ev_charging');
  }
}

function cleanRoomNumber(value: string): string {
  return value.replace(/[^a-z0-9]/giu, '').toUpperCase();
}

function containedIntent(query: string): ContainedIntent | null {
  const patterns: ReadonlyArray<{
    pattern: RegExp;
    category: ContainedDestinationCategory;
  }> = [
    { pattern: /^elevator(?: in)? (.+)$/u, category: 'elevator' },
    {
      pattern: /^accessible entrance(?: in)? (.+)$/u,
      category: 'accessible_entrance',
    },
    { pattern: /^restroom(?: in)? (.+)$/u, category: 'restroom' },
  ];
  for (const candidate of patterns) {
    const match = candidate.pattern.exec(query);
    if (match?.[1] !== undefined) {
      return { buildingQuery: match[1], category: candidate.category };
    }
  }
  return null;
}

function matchesContainedCategory(
  destination: CampusDestinationRecord,
  category: ContainedDestinationCategory,
): boolean {
  const categories = stringArray(destination.metadata.categories);
  if (category === 'accessible_entrance') {
    return (
      destination.type === 'entrance' &&
      (categories.includes('accessible_entrance') ||
        destination.metadata.accessible === true)
    );
  }
  return categories.includes(category);
}

export function normalizeCampusQuery(input: string): NormalizedCampusQuery {
  const display = input.trim().replace(/\s+/gu, ' ');
  const normalizedInput = display
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
  const meaningfulLength = normalizedInput.replace(/\s/gu, '').length;
  const compact = /^([a-z]{2,10})(\d[a-z0-9]*)$/u.exec(normalizedInput);
  if (compact?.[1] !== undefined && compact[2] !== undefined) {
    const roomNumber = cleanRoomNumber(compact[2]);
    return {
      display,
      normalized: `${compact[1]} ${roomNumber.toLocaleLowerCase('en-US')}`,
      meaningfulLength,
      roomIntent: { buildingQuery: compact[1], roomNumber },
    };
  }

  const tokens = normalizedInput.split(' ').filter((token) => token !== 'room');
  const roomMarkerPresent = /\broom\b/iu.test(normalizedInput);
  let roomIndex = -1;
  if (roomMarkerPresent) {
    roomIndex = tokens.findIndex((token) => /\d/u.test(token));
  } else if (tokens.length > 1 && /^\d/u.test(tokens[tokens.length - 1] ?? '')) {
    roomIndex = tokens.length - 1;
  }
  if (roomIndex >= 0) {
    const roomToken = tokens[roomIndex];
    const buildingQuery = tokens.filter((_, index) => index !== roomIndex).join(' ');
    if (roomToken !== undefined && buildingQuery.length > 0) {
      const roomNumber = cleanRoomNumber(roomToken);
      return {
        display,
        normalized: `${buildingQuery} ${roomNumber.toLocaleLowerCase('en-US')}`,
        meaningfulLength,
        roomIntent: { buildingQuery, roomNumber },
      };
    }
  }

  return {
    display,
    normalized: normalizedInput,
    meaningfulLength,
    roomIntent: null,
  };
}

function normalized(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + substitution,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function scoreDestination(
  query: string,
  destination: CampusDestinationRecord,
): number {
  const code = normalized(destination.code ?? '');
  const name = normalized(destination.name);
  const aliases = destination.aliases.map(normalized);
  if (code === query) return 700;
  if (name === query) return 600;
  if (aliases.includes(query)) return 500;
  if (
    code.startsWith(query) ||
    name.startsWith(query) ||
    aliases.some((alias) => alias.startsWith(query))
  ) {
    return 400;
  }
  const words = [name, ...aliases];
  const fuzzy = words.some((value) => {
    const distance = editDistance(value, query);
    return distance <= Math.max(1, Math.floor(query.length * 0.2));
  });
  if (fuzzy) return 300;
  return 200 + Math.max(0, Math.min(destination.rank, 1));
}

function validCoordinatePair(
  latitude: number | null,
  longitude: number | null,
): latitude is number {
  return (
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

export function toPublicCampusResult(
  destination: CampusDestinationRecord,
  subtitleOverride?: string,
): PublicCampusResult {
  const outdoorLatitude =
    destination.outdoorDestinationLatitude ?? destination.latitude;
  const outdoorLongitude =
    destination.outdoorDestinationLongitude ?? destination.longitude;
  const hasOutdoor = validCoordinatePair(outdoorLatitude, outdoorLongitude);
  const hasIndoor =
    destination.indoorDestinationId !== null &&
    destination.indoorDestinationId.trim().length > 0;
  const hasNavigation = hasOutdoor || hasIndoor;
  const title =
    destination.type === 'room' &&
    destination.buildingCode !== null &&
    destination.roomNumber !== null
      ? `${destination.buildingCode} ${destination.roomNumber}`
      : destination.name;
  const defaultSubtitle =
    destination.type === 'room'
      ? [destination.parentName ?? destination.buildingCode, destination.floorNumber === null ? null : `Floor ${destination.floorNumber}`]
          .filter((value): value is string => value !== null && value.length > 0)
          .join(' · ')
      : destination.code ??
        destination.type.charAt(0).toUpperCase() + destination.type.slice(1);

  return {
    id: destination.id,
    type: destination.type,
    title,
    subtitle: subtitleOverride ?? defaultSubtitle,
    source: destination.source,
    ...(destination.buildingCode === null
      ? {}
      : { buildingCode: destination.buildingCode }),
    ...(destination.roomNumber === null ? {} : { roomNumber: destination.roomNumber }),
    ...(destination.floorNumber === null ? {} : { floorNumber: destination.floorNumber }),
    ...(hasNavigation
      ? {
          navigation: {
            ...(hasOutdoor
              ? {
                  outdoorDestination: {
                    latitude: outdoorLatitude,
                    longitude: outdoorLongitude as number,
                  },
                }
              : {}),
            ...(hasIndoor
              ? { indoorDestinationId: destination.indoorDestinationId as string }
              : {}),
          },
        }
      : {}),
  };
}

function buildingAlternative(building: CampusDestinationRecord): PublicCampusResult {
  return toPublicCampusResult(
    building,
    `Building-level alternative${building.code === null ? '' : ` · ${building.code}`}`,
  );
}

function rankRooms(
  rooms: CampusDestinationRecord[],
  roomNumber: string,
): CampusDestinationRecord[] {
  return [...rooms].sort((left, right) => {
    const leftExact = left.roomNumber?.toUpperCase() === roomNumber ? 1 : 0;
    const rightExact = right.roomNumber?.toUpperCase() === roomNumber ? 1 : 0;
    return rightExact - leftExact || left.name.localeCompare(right.name);
  });
}

export function createCampusService(dependencies: CampusServiceDependencies) {
  return {
    async autocomplete(input: string, limit: number): Promise<CampusSearchResponse> {
      const query = normalizeCampusQuery(input);
      const directBuildingCode = DirectBuildingIntents[query.normalized];
      if (directBuildingCode !== undefined) {
        const building = await dependencies.campusPlaces.findBuildingByCode(
          directBuildingCode,
        );
        return {
          query: query.display,
          results:
            building === null || !building.active || !building.searchable
              ? []
              : [toPublicCampusResult(building)],
        };
      }
      const contained = containedIntent(query.normalized);
      if (contained !== null) {
        const buildingCandidates = await dependencies.campusPlaces.searchDestinations(
          contained.buildingQuery,
          10,
        );
        const building = buildingCandidates
          .filter((candidate) => candidate.type === 'building')
          .sort(
            (left, right) =>
              scoreDestination(contained.buildingQuery, right) -
                scoreDestination(contained.buildingQuery, left) ||
              left.name.localeCompare(right.name),
          )[0];
        if (building === undefined) return { query: query.display, results: [] };
        const children = await dependencies.campusPlaces.searchBuildingChildren(
          building.id,
          contained.category,
          limit,
        );
        return {
          query: query.display,
          results: children
            .filter(
              (child) =>
                child.active &&
                child.searchable &&
                child.parentDestinationId === building.id &&
                matchesContainedCategory(child, contained.category),
            )
            .slice(0, limit)
            .map((child) => toPublicCampusResult(child)),
        };
      }
      if (query.roomIntent !== null) {
        const buildingCandidates = await dependencies.campusPlaces.searchDestinations(
          query.roomIntent.buildingQuery,
          10,
        );
        const building = buildingCandidates
          .filter((candidate) => candidate.type === 'building')
          .sort(
            (left, right) =>
              scoreDestination(query.roomIntent?.buildingQuery ?? '', right) -
                scoreDestination(query.roomIntent?.buildingQuery ?? '', left) ||
              left.name.localeCompare(right.name),
          )[0];
        if (building === undefined) return { query: query.display, results: [] };
        const rooms = await dependencies.campusPlaces.searchBuildingRooms(
          building.id,
          query.roomIntent.roomNumber,
          limit,
        );
        if (rooms.length === 0) {
          return { query: query.display, results: [buildingAlternative(building)] };
        }
        return {
          query: query.display,
          results: rankRooms(rooms, query.roomIntent.roomNumber)
            .slice(0, limit)
            .map((room) => toPublicCampusResult(room)),
        };
      }

      const category = CategoryQueries[query.normalized];
      const local =
        category === undefined
          ? await dependencies.campusPlaces.searchDestinations(query.normalized, limit)
          : await dependencies.campusPlaces.searchCategoryDestinations(category, limit);
      const ranked = local
        .filter((destination) => destination.active && destination.searchable)
        .filter((destination) => category === undefined || matchesCategory(destination, category))
        .map((destination) => ({
          destination,
          score:
            category === undefined
              ? scoreDestination(query.normalized, destination)
              : 100 + destination.rank,
        }))
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.destination.name.localeCompare(right.destination.name),
        )
        .slice(0, limit)
        .map(({ destination }) => toPublicCampusResult(destination));
      if (ranked.length > 0) return { query: query.display, results: ranked };

      const external = await dependencies.externalPlaces.searchExternalPlaces(
        query.display,
        limit,
      );
      return {
        query: query.display,
        results: external.slice(0, limit).map((place) => ({
          id: `mapbox:${place.id}`,
          type: 'external',
          title: place.name,
          subtitle: place.description,
          source: 'mapbox',
          external: true,
          ...(place.attribution === undefined
            ? {}
            : { attribution: place.attribution }),
          navigation: {
            outdoorDestination: {
              latitude: place.latitude,
              longitude: place.longitude,
            },
          },
        })),
      };
    },
    async findPlace(id: string): Promise<PublicCampusResult | null> {
      const place = await dependencies.campusPlaces.findPlaceById(id);
      return place === null || !place.active || !place.searchable
        ? null
        : toPublicCampusResult(place);
    },
    async searchRooms(buildingCode: string, input: string, limit: number) {
      const building = await dependencies.campusPlaces.findBuildingByCode(
        buildingCode.trim().toUpperCase(),
      );
      if (building === null || !building.active || !building.searchable) {
        return null;
      }
      const query = normalizeCampusQuery(input);
      const roomQuery = query.normalized.replace(/\s+/gu, '').toUpperCase();
      const rooms = await dependencies.campusPlaces.searchBuildingRooms(
        building.id,
        roomQuery,
        limit,
      );
      return {
        building: {
          id: building.id,
          code: building.code ?? building.buildingCode ?? buildingCode.toUpperCase(),
          name: building.name,
        },
        query: query.display,
        results: rankRooms(rooms, roomQuery)
          .filter((room) => room.active && room.searchable && room.type === 'room')
          .slice(0, limit)
          .map((room) => toPublicCampusResult(room)),
      };
    },
  };
}
