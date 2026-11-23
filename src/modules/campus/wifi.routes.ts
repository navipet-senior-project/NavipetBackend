import type { FastifyPluginAsync } from 'fastify';

const wifiRoutes: FastifyPluginAsync = (app) => {
  app.get<{ Params: { buildingCode: string } }>(
    '/buildings/:buildingCode/wifi-fingerprints',
    { schema: { params: { type: 'object', required: ['buildingCode'], properties: { buildingCode: { type: 'string', pattern: '^[A-Za-z0-9]{1,20}$' } } } } },
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
