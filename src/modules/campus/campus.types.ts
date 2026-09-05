export type CampusDestinationType =
  | 'building'
  | 'room'
  | 'entrance'
  | 'parking'
  | 'dining'
  | 'service'
  | 'amenity'
  | 'transit'
  | 'landmark';

export interface CampusDestinationRecord {
  id: string;
  type: CampusDestinationType;
  name: string;
  code: string | null;
  aliases: string[];
  parentDestinationId: string | null;
  parentName?: string | null;
  buildingCode: string | null;
  roomNumber: string | null;
  floorNumber: string | null;
  latitude: number | null;
  longitude: number | null;
  outdoorDestinationLatitude: number | null;
  outdoorDestinationLongitude: number | null;
  source: string;
  active: boolean;
  searchable: boolean;
  metadata: Record<string, unknown>;
  rank: number;
  indoorDestinationId: string | null;
}

export interface ExternalPlaceRecord {
  id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  attribution?: string;
}

export interface CampusPlacesGateway {
  searchDestinations(query: string, limit: number): Promise<CampusDestinationRecord[]>;
  searchCategoryDestinations(
    category: CampusCategorySearch,
    limit: number,
  ): Promise<CampusDestinationRecord[]>;
  listProximityDestinations(): Promise<CampusDestinationRecord[]>;
  findPlaceById(id: string): Promise<CampusDestinationRecord | null>;
  findBuildingByCode(code: string): Promise<CampusDestinationRecord | null>;
  searchBuildingRooms(
    buildingId: string,
    query: string,
    limit: number,
  ): Promise<CampusDestinationRecord[]>;
  searchBuildingChildren(
    buildingId: string,
    category: ContainedDestinationCategory,
    limit: number,
  ): Promise<CampusDestinationRecord[]>;
}

export interface ExternalPlacesGateway {
  searchExternalPlaces(query: string, limit: number): Promise<ExternalPlaceRecord[]>;
}

export type CampusCategorySearch =
  | 'visitor_parking'
  | 'accessible_parking'
  | 'gender_neutral_restroom'
  | 'coffee'
  | 'shuttle_stop'
  | 'bus_stop'
  | 'bike_rack'
  | 'ev_charging';

export type ContainedDestinationCategory =
  | 'elevator'
  | 'accessible_entrance'
  | 'restroom';

export type ProximityIntent =
  | 'restroom'
  | 'food'
  | 'parking'
  | 'bus_stop'
  | 'coffee';

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export interface PublicCampusResult {
  id: string;
  type: CampusDestinationType | 'external';
  title: string;
  subtitle: string;
  source: string;
  buildingCode?: string;
  roomNumber?: string;
  floorNumber?: string;
  external?: true;
  attribution?: string;
  distanceMeters?: number;
  navigation?: {
    outdoorDestination?: { latitude: number; longitude: number };
    indoorDestinationId?: string;
  };
}

export interface CampusSearchResponse {
  query: string;
  results: PublicCampusResult[];
  proximity?: {
    intent: ProximityIntent;
    status: 'ok';
    radiusMeters: number;
  };
}
