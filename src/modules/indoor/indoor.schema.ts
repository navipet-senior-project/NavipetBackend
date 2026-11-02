import Type from 'typebox';
import { ErrorResponseSchema } from '../../common/errors/error-response.schema.js';

export const IndoorTokenRouteSchema = {
  tags: ['Indoor'],
  summary: 'Get a short-lived MultiSet token for indoor AR',
  description: 'Requires a standard authenticated session. Returns a cached MultiSet token with more than five minutes remaining. Limited to five requests per user per minute. Credentials stay on the backend. No request body is required.',
  security: [{ bearerAuth: [] }],
  response: {
    200: Type.Object({
      token: Type.String({ minLength: 1 }),
      expiresOn: Type.String({ format: 'date-time', description: 'MultiSet token expiry in ISO 8601 format' }),
    }, { additionalProperties: false }),
    401: ErrorResponseSchema('Authentication required'),
    429: ErrorResponseSchema('Too many requests'),
    502: ErrorResponseSchema('MultiSet token exchange failed'),
    503: ErrorResponseSchema('INDOOR_AR_UNAVAILABLE: MultiSet client credentials are not configured'),
  },
};
