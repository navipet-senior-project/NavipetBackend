import type { FastifyPluginAsync } from 'fastify';

const wifiRoutes: FastifyPluginAsync = (app) => {
  app.get<{ Params: { buildingCode: string } }>(
    '/buildings/:buildingCode/wifi-fingerprints',
    {
      schema: {
        tags: ['Wi-Fi Fingerprint'],
        summary: 'Get a building?s Wi-Fi survey',
        description:
          'Returns saved Wi-Fi fingerprints for active room records in one building. ' +
          'The app can compare a fresh Android Wi-Fi scan with these samples to estimate a nearby surveyed room.\n\n' +
          'This endpoint currently does not require an access token.\n\n' +
          '`buildingCode` is the campus building code, for example `VEC`. ' +
          'It is matched case-insensitively and must contain 1?20 letters or digits.\n\n' +
          '---\n\n' +
          'Each fingerprint contains a room point, capture time, and access-point identifiers, ' +
          'signal strengths in dBm, and frequencies in MHz. Coordinates use the `multiset-mapset` frame.\n\n' +
          'Only active rooms with saved fingerprints are included. A building with no matching ' +
          'saved surveys returns an empty `fingerprints` array.\n\n' +
          'This endpoint returns reference samples; matching is performed by the app. ' +
          'A match is an estimate and requires Android Wi-Fi scan support.\n\n' +
          'If the survey database is unavailable, the endpoint returns 503.',
        params: {
          type: 'object',
          required: ['buildingCode'],
          properties: {
            buildingCode: {
              type: 'string',
              pattern: '^[A-Za-z0-9]{1,20}$',
              description: 'Campus building code, such as VEC; case-insensitive.',
            },
          },
        },
        response: {
          200: {
            description: 'Saved room fingerprints; empty if none exist.',
            type: 'object',
            required: ['schemaVersion', 'building', 'coordinateFrame', 'fingerprints'],
            properties: {
              schemaVersion: { type: 'integer', example: 1 },
              building: { type: 'string', example: 'VEC' },
              coordinateFrame: { type: 'string', example: 'multiset-mapset' },
              fingerprints: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['point', 'capturedAt', 'accessPoints'],
                  properties: {
                    point: {
                      type: 'object',
                      required: ['id', 'floor', 'type', 'x', 'y', 'z'],
                      properties: {
                        id: { type: 'string', example: 'VEC124' },
                        floor: { type: 'string', example: '1' },
                        type: { type: 'string', example: 'door' },
                        x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' },
                      },
                    },
                    capturedAt: { type: 'string', format: 'date-time' },
                    accessPoints: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['bssid', 'rssiDbm', 'frequencyMhz'],
                        properties: {
                          bssid: { type: 'string', description: 'Access point identifier.' },
                          rssiDbm: { type: 'integer', description: 'Signal strength in dBm.' },
                          frequencyMhz: { type: 'integer', description: 'Wi-Fi frequency in MHz.' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          503: {
            description: 'The Wi-Fi survey database is unavailable.',
            type: 'object', properties: { message: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const client = app.supabase.adminClient;
      if (!client) return reply.code(503).send({ message: 'Wi-Fi survey unavailable' });
      const { data, error } = await client.from('campus_destinations')
        .select('wifi_fingerprints')
        .eq('type', 'room').eq('active', true)
        .ilike('building_code', request.params.buildingCode)
        .not('wifi_fingerprints', 'is', null);
      if (error) {
        request.log.error({ code: error.code }, 'Wi-Fi survey lookup failed');
        return reply.code(503).send({ message: 'Wi-Fi survey unavailable' });
      }
      reply.header('Cache-Control', 'private, max-age=300');
      const fingerprints: unknown[] = [];
      for (const row of data) {
        const value: unknown = row.wifi_fingerprints;
        if (Array.isArray(value)) fingerprints.push(...(value as unknown[]));
      }
      return { schemaVersion: 1, building: request.params.buildingCode.toUpperCase(), coordinateFrame: 'multiset-mapset', fingerprints }; 
    },
  );
  return Promise.resolve();
};
export default wifiRoutes;
