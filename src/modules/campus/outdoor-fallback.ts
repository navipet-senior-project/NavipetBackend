import type {
  CampusDestinationRecord,
  ExternalPlaceRecord,
  ExternalPlacesGateway,
} from './campus.types.js';

export interface ResolvedOutdoorDestination {
  latitude: number;
  longitude: number;
  attribution?: string;
}

export interface OutdoorFallbackResolver {
  resolve(
    destination: CampusDestinationRecord,
  ): Promise<ResolvedOutdoorDestination | null>;
  resolveAll(
    destinations: CampusDestinationRecord[],
  ): Promise<Map<string, ResolvedOutdoorDestination>>;
}

// The canonical CSULB dataset carries no machine-readable coordinates, so a
// record only becomes routable once an external place with the same name is
// matched inside the configured campus bounding box.
const ExternalSearchLimit = 5;
const MaxDerivationsPerQuery = 5;
const MaxCacheEntries = 500;

// Tokens shared by most campus records; they cannot establish that an external
// place is the same destination.
// Directions are deliberately absent: "Palo Verde North" and "Palo Verde
// South" are different structures.
const GenericTokens = new Set([
  'and',
  'beach',
  'building',
  'california',
  'campus',
  'center',
  'centre',
  'csulb',
  'floor',
  'for',
  'hall',
  'lot',
  'long',
  'parking',
  'room',
  'state',
  'structure',
  'the',
  'university',
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length >= 3);
}

function identifyingTokens(value: string): Set<string> {
  return new Set(tokenize(value).filter((token) => !GenericTokens.has(token)));
}

// Any of the canonical name or its aliases may be the form the external index
// knows, so each is matched independently.
function candidateNames(destination: CampusDestinationRecord): string[] {
  return [destination.name, ...destination.aliases].filter(
    (value) => identifyingTokens(value).size > 0,
  );
}

// Designators such as the G1..G14 in "General Parking Lot G1" are the only
// thing separating sibling records, so an external place that omits them is a
// different destination even when every word matches.
function designators(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((token) => /^[a-z]{0,2}\d{1,3}$/u.test(token));
}

// A partial overlap is not enough: "LBS Financial Credit Union" is a branch,
// not the "LBS Financial Credit Union Pyramid" arena. Every distinguishing
// word of the campus name must survive in the external one.
function matchesName(candidate: string, place: ExternalPlaceRecord): boolean {
  const found = new Set(tokenize(place.name));
  const foundDesignators = new Set(designators(place.name));
  return (
    [...identifyingTokens(candidate)].every((token) => found.has(token)) &&
    designators(candidate).every((token) => foundDesignators.has(token))
  );
}

function isSameDestination(
  destination: CampusDestinationRecord,
  place: ExternalPlaceRecord,
): boolean {
  return candidateNames(destination).some((candidate) =>
    matchesName(candidate, place),
  );
}

function isDerivable(destination: CampusDestinationRecord): boolean {
  // Rooms and entrances are interior or unnamed points that no external place
  // index can resolve; deriving them would route students to the wrong door.
  return destination.type !== 'room' && destination.type !== 'entrance';
}

export function createOutdoorFallbackResolver(
  externalPlaces: ExternalPlacesGateway,
): OutdoorFallbackResolver {
  const cache = new Map<string, ResolvedOutdoorDestination | null>();

  function remember(
    id: string,
    value: ResolvedOutdoorDestination | null,
  ): ResolvedOutdoorDestination | null {
    if (cache.size >= MaxCacheEntries) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(id, value);
    return value;
  }

  async function resolve(
    destination: CampusDestinationRecord,
  ): Promise<ResolvedOutdoorDestination | null> {
    if (!isDerivable(destination)) return null;
    const cached = cache.get(destination.id);
    if (cached !== undefined) return cached;
    if (candidateNames(destination).length === 0) {
      return remember(destination.id, null);
    }

    const places = await externalPlaces.searchExternalPlaces(
      destination.name,
      ExternalSearchLimit,
    );
    const match = places.find((place) => isSameDestination(destination, place));
    if (match === undefined) return remember(destination.id, null);
    return remember(destination.id, {
      latitude: match.latitude,
      longitude: match.longitude,
      ...(match.attribution === undefined
        ? {}
        : { attribution: match.attribution }),
    });
  }

  async function resolveAll(
    destinations: CampusDestinationRecord[],
  ): Promise<Map<string, ResolvedOutdoorDestination>> {
    const derivable = destinations
      .filter(isDerivable)
      .slice(0, MaxDerivationsPerQuery);
    const resolved = await Promise.all(
      derivable.map(async (destination) => ({
        id: destination.id,
        outdoor: await resolve(destination),
      })),
    );
    return new Map(
      resolved
        .filter(
          (entry): entry is { id: string; outdoor: ResolvedOutdoorDestination } =>
            entry.outdoor !== null,
        )
        .map((entry) => [entry.id, entry.outdoor]),
    );
  }

  return { resolve, resolveAll };
}
