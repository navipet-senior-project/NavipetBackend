import Type from 'typebox';

export const HealthResponseSchema = Type.Object(
  { status: Type.Literal('ok') },
  { $id: 'HealthResponse' },
);

export const HealthRouteSchema = {
  tags: ['Health'],
  summary: 'Check API process liveness',
  description:
    'Unauthenticated liveness probe used as the platform health check. Exempt from rate limiting and touches neither Supabase nor MultiSet, so it reports only that this process is accepting requests — not that its dependencies are healthy. Always returns 200 with { "status": "ok" } while the process is up.',
  response: {
    200: HealthResponseSchema,
  },
};
