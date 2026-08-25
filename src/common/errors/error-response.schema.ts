import Type from 'typebox';

// Matches the envelope built by src/plugins/error-handler.ts's body().
// A factory (not a single $id schema) because each call site needs its
// own OpenAPI `description` for that specific status code.
export function ErrorResponseSchema(description: string) {
  return Type.Object(
    {
      error: Type.Object({
        code: Type.String(),
        message: Type.String(),
        requestId: Type.String(),
      }),
    },
    { description },
  );
}
