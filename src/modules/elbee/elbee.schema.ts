import Type from 'typebox';

import { ErrorResponseSchema } from '../../common/errors/error-response.schema.js';

const NullableString = Type.Union([Type.String(), Type.Null()]);

const DestinationCardSchema = Type.Object(
  {
    placeId: Type.String(),
    title: Type.String(),
    subtitle: Type.String(),
    buildingCode: NullableString,
    roomNumber: NullableString,
    floor: NullableString,
    source: Type.String(),
    indoor: Type.Union([Type.Literal('door_pose'), Type.Literal('none')]),
    indoorNote: Type.String(),
    provenanceUrl: Type.Null(),
  },
  { additionalProperties: false },
);

const ParkingRuleSchema = Type.Object(
  {
    ruleId: Type.String(),
    text: Type.String(),
    sourceUrl: Type.String(),
    retrievedAt: Type.Literal('2026-11-10'),
  },
  { additionalProperties: false },
);

const ElbeeResponseSchema = Type.Object(
  {
    provider: Type.Union([
      Type.Literal('disabled'),
      Type.Literal('demo'),
      Type.Literal('mock'),
      Type.Literal('anthropic'),
    ]),
    liveModel: Type.Boolean(),
    modelOutputAccepted: Type.Boolean(),
    status: Type.Union([
      Type.Literal('ok'),
      Type.Literal('ambiguous'),
      Type.Literal('no_match'),
      Type.Literal('off_topic'),
      Type.Literal('budget_exhausted'),
      Type.Literal('consent_required'),
      Type.Literal('unavailable'),
      Type.Literal('demo'),
    ]),
    disclosure: Type.String(),
    explanation: Type.String(),
    clarifyingQuestion: NullableString,
    cards: Type.Array(DestinationCardSchema, { maxItems: 4 }),
    parking: Type.Union([
      Type.Object(
        {
          authoritative: Type.Literal(false),
          disclaimer: Type.String(),
          unavailableReason: NullableString,
          rules: Type.Array(ParkingRuleSchema),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    nextClass: Type.Union([
      Type.Object(
        {
          courseCode: Type.String(),
          startTime: Type.String(),
          endTime: Type.String(),
          placeId: NullableString,
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
  },
  { additionalProperties: false },
);

export const ElbeeAskRouteSchema = {
  tags: ['Elbee'],
  summary: "Ask NaviPet's Elbee for a verified CSULB destination",
  description:
    'Standard bearer session. Returns verified campus cards and optional dated parking rules. ' +
    'Does not start navigation, return coordinates, or call Anthropic unless the server is explicitly configured with a key, an allowlisted model, and daily budget caps. ' +
    'mode=demo is labeled demo data and is not a live model.',
  security: [{ bearerAuth: [] }],
  body: Type.Object(
    {
      question: Type.String({ minLength: 1, maxLength: 500 }),
      scheduleConsent: Type.Boolean(),
      mode: Type.Optional(Type.Union([Type.Literal('ask'), Type.Literal('demo')])),
      clientRequestId: Type.Optional(Type.String({ pattern: '^[A-Za-z0-9_-]{8,80}$' })),
    },
    { additionalProperties: false },
  ),
  response: {
    200: ElbeeResponseSchema,
    401: ErrorResponseSchema('Authentication required'),
    409: ErrorResponseSchema('This request id is already running'),
    422: ErrorResponseSchema('Question or consent was invalid'),
    429: ErrorResponseSchema('Too many requests'),
    502: ErrorResponseSchema('Campus data was unavailable'),
  },
};
