import Type from 'typebox';

import { ErrorResponseSchema } from '../../common/errors/error-response.schema.js';

// Status contract
//   GET   /profiles/me/accessibility  200 401 429 502
//   PATCH /profiles/me/accessibility  200 400 401 422 429 502
// 400 is malformed JSON and 422 is a schema failure; both come from the
// global error handler. 502 means preference storage failed.

const strict = { additionalProperties: false };
// A group that is present must change something.
const strictPatch = { additionalProperties: false, minProperties: 1 };

const MobilitySchema = Type.Object(
  {
    accessibleRoutes: Type.Boolean({
      description: 'Prioritize wheelchair and ramp access.',
    }),
    avoidStairs: Type.Boolean(),
    preferElevators: Type.Boolean(),
    avoidSteepSlopes: Type.Boolean(),
  },
  strict,
);

const GuidanceSchema = Type.Object(
  {
    voiceGuidance: Type.Boolean({ description: 'Spoken turn-by-turn directions.' }),
    hapticTurnAlerts: Type.Boolean(),
  },
  strict,
);

const VisualsSchema = Type.Object(
  {
    highContrastMap: Type.Boolean(),
    largerMapLabels: Type.Boolean(),
    reduceMotion: Type.Boolean(),
    screenReaderDirections: Type.Boolean({
      description: 'Screen-reader optimized directions.',
    }),
  },
  strict,
);

const MobilityPatchSchema = Type.Object(
  {
    accessibleRoutes: Type.Optional(Type.Boolean()),
    avoidStairs: Type.Optional(Type.Boolean()),
    preferElevators: Type.Optional(Type.Boolean()),
    avoidSteepSlopes: Type.Optional(Type.Boolean()),
  },
  strictPatch,
);

const GuidancePatchSchema = Type.Object(
  {
    voiceGuidance: Type.Optional(Type.Boolean()),
    hapticTurnAlerts: Type.Optional(Type.Boolean()),
  },
  strictPatch,
);

const VisualsPatchSchema = Type.Object(
  {
    highContrastMap: Type.Optional(Type.Boolean()),
    largerMapLabels: Type.Optional(Type.Boolean()),
    reduceMotion: Type.Optional(Type.Boolean()),
    screenReaderDirections: Type.Optional(Type.Boolean()),
  },
  strictPatch,
);

export const AccessibilityResponseSchema = Type.Object(
  {
    accessibility: Type.Object(
      {
        mobility: MobilitySchema,
        guidance: GuidanceSchema,
        visuals: VisualsSchema,
      },
      strict,
    ),
  },
  {
    $id: 'AccessibilityPreferencesResponse',
    description:
      'All ten accessibility preferences of the authenticated user, grouped ' +
      'as on the Accessibility screen.',
  },
);

export const UpdateAccessibilityBodySchema = Type.Object(
  {
    mobility: Type.Optional(MobilityPatchSchema),
    guidance: Type.Optional(GuidancePatchSchema),
    visuals: Type.Optional(VisualsPatchSchema),
  },
  {
    additionalProperties: false,
    minProperties: 1,
    'x-examples': {
      oneToggle: {
        summary: 'Turn on one toggle',
        description: 'Only "Avoid stairs" changes; the other nine keep their values.',
        value: { mobility: { avoidStairs: true } },
      },
      severalGroups: {
        summary: 'Change toggles in several sections',
        description: 'Fields from different groups are applied in one request.',
        value: {
          mobility: { preferElevators: true },
          guidance: { hapticTurnAlerts: false },
          visuals: { highContrastMap: true, reduceMotion: true },
        },
      },
    },
  },
);

const commonErrors = {
  401: ErrorResponseSchema('Access token is missing, invalid, or expired.'),
  429: ErrorResponseSchema('Too many requests.'),
  502: ErrorResponseSchema('Accessibility preference storage is unavailable.'),
};

export const GetAccessibilityRouteSchema = {
  tags: ['Accessibility'],
  summary: 'Get the accessibility preferences',
  description:
    'Returns the ten accessibility preferences of the authenticated user, ' +
    'grouped as on the Accessibility screen.\n\n' +
    'Requires `Authorization: Bearer <access_token>`. Each user sees only ' +
    'their own preferences.\n\n' +
    'A user who has never changed a preference gets the defaults, not a ' +
    '404: voice guidance and haptic turn alerts are on, everything else is ' +
    'off.',
  security: [{ bearerAuth: [] }],
  response: { 200: AccessibilityResponseSchema, ...commonErrors },
};

export const UpdateAccessibilityRouteSchema = {
  tags: ['Accessibility'],
  summary: 'Update accessibility preferences',
  description:
    'Changes one or more accessibility preferences of the authenticated ' +
    'user and returns all ten.\n\n' +
    'Requires `Authorization: Bearer <access_token>`. A user can change ' +
    'only their own preferences.\n\n' +
    'Send only the toggles that changed, inside their group. Toggles left ' +
    'out keep their current value.\n\n' +
    'Every toggle is independent. Turning on accessible routes does not ' +
    'turn on avoid stairs or prefer elevators.\n\n' +
    'The request must change at least one toggle. An empty object, an ' +
    'empty group, an unknown key, or a non-boolean value returns 422.',
  security: [{ bearerAuth: [] }],
  body: UpdateAccessibilityBodySchema,
  response: {
    200: AccessibilityResponseSchema,
    400: ErrorResponseSchema('Request body is not valid JSON.'),
    422: ErrorResponseSchema('Request body failed validation.'),
    ...commonErrors,
  },
};
