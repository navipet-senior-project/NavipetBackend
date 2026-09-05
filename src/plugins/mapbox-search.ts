import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import type { Environment } from '../config/env.js';
import type {
  ExternalPlaceRecord,
  ExternalPlacesGateway,
} from '../modules/campus/campus.types.js';

type Fetcher = typeof fetch;

interface MapboxFeature {
  geometry?: { coordinates?: unknown };
  properties?: {
    mapbox_id?: unknown;
    name?: unknown;
    place_formatted?: unknown;
    full_address?: unknown;
  };
}

function parseFeature(feature: MapboxFeature): ExternalPlaceRecord | null {
  const coordinates = feature.geometry?.coordinates;
  const properties = feature.properties;
  if (
    !Array.isArray(coordinates) ||
    typeof coordinates[0] !== 'number' ||
    typeof coordinates[1] !== 'number' ||
    typeof properties?.mapbox_id !== 'string' ||
    typeof properties.name !== 'string'
  ) {
    return null;
  }
  const longitude = coordinates[0];
  const latitude = coordinates[1];
  if (
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }
  const description =
    typeof properties.full_address === 'string'
      ? properties.full_address
      : typeof properties.place_formatted === 'string'
        ? properties.place_formatted
        : '';
  return {
    id: properties.mapbox_id,
    name: properties.name,
    description,
    latitude,
    longitude,
  };
}

export function createMapboxSearchGateway(
  config: Environment,
  fetcher: Fetcher = fetch,
): ExternalPlacesGateway {
  return {
    async searchExternalPlaces(query, limit) {
      if (
        config.MAPBOX_ACCESS_TOKEN === undefined ||
        config.MAPBOX_SEARCH_PROXIMITY === undefined ||
        config.MAPBOX_SEARCH_BBOX === undefined
      ) {
        return [];
      }
      const url = new URL(
        '/search/searchbox/v1/forward',
        'https://api.mapbox.com',
      );
      url.searchParams.set('q', query);
      url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 10)));
      url.searchParams.set('language', 'en');
      url.searchParams.set('country', 'US');
      url.searchParams.set('types', 'address,poi');
      url.searchParams.set('proximity', config.MAPBOX_SEARCH_PROXIMITY);
      url.searchParams.set('bbox', config.MAPBOX_SEARCH_BBOX);
      url.searchParams.set('access_token', config.MAPBOX_ACCESS_TOKEN);

      const response = await fetcher(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) throw new Error('Mapbox Search Box request failed');
      const body = (await response.json()) as {
        features?: unknown;
        attribution?: unknown;
      };
      if (!Array.isArray(body.features)) return [];
      return body.features
        .map((feature) => parseFeature(feature as MapboxFeature))
        .filter((feature): feature is ExternalPlaceRecord => feature !== null)
        .map((feature) => ({
          ...feature,
          ...(typeof body.attribution === 'string'
            ? { attribution: body.attribution }
            : {}),
        }));
    },
  };
}

export interface MapboxSearchPluginOptions {
  gateway?: ExternalPlacesGateway;
}

const mapboxSearchPlugin: FastifyPluginAsync<MapboxSearchPluginOptions> = (
  fastify,
  options,
) => {
  fastify.decorate(
    'externalPlaces',
    options.gateway ?? createMapboxSearchGateway(fastify.config),
  );
  return Promise.resolve();
};

export default fp(mapboxSearchPlugin, {
  fastify: '5.x',
  name: 'app-mapbox-search',
});
