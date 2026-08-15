import Type from 'typebox';

export const HealthResponseSchema = Type.Object(
  { status: Type.Literal('ok') },
  { $id: 'HealthResponse' },
);

export const HealthRouteSchema = {
  tags: ['Health'],
  summary: 'Check API process liveness',
  response: {
    200: HealthResponseSchema,
  },
};
