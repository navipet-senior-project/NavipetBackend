import Type from 'typebox';

// Matches the envelope built by src/plugins/error-handler.ts's body().
export const ErrorResponseSchema = Type.Object(
  {
    error: Type.Object({
      code: Type.String(),
      message: Type.String(),
      requestId: Type.String(),
    }),
  },
  { $id: 'ErrorResponse' },
);
