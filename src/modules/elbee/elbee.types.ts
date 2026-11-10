export type ElbeeProvider = 'disabled' | 'mock' | 'anthropic';

export type ElbeeStatus =
  | 'ok'
  | 'ambiguous'
  | 'no_match'
  | 'off_topic'
  | 'budget_exhausted'
  | 'consent_required'
  | 'unavailable';

export interface DestinationCard {
  placeId: string;
  title: string;
  subtitle: string;
  buildingCode: string | null;
  roomNumber: string | null;
  floor: string | null;
  source: string;
  indoor: 'door_pose' | 'none';
  indoorNote: string;
  provenanceUrl: null;
}

export interface ParkingRule {
  ruleId: string;
  text: string;
  sourceUrl: string;
  retrievedAt: '2026-11-10';
}

export interface ParkingAnswer {
  authoritative: false;
  disclaimer: string;
  unavailableReason: string | null;
  rules: ParkingRule[];
}

export interface NextClassAnswer {
  courseCode: string;
  startTime: string;
  endTime: string;
  placeId: string | null;
}

export interface ElbeeResponse {
  provider: ElbeeProvider;
  liveModel: boolean;
  modelOutputAccepted: boolean;
  status: ElbeeStatus;
  disclosure: string;
  explanation: string;
  clarifyingQuestion: string | null;
  cards: DestinationCard[];
  parking: ParkingAnswer | null;
  nextClass: NextClassAnswer | null;
}

export const ELBEE_DISCLOSURE = {
  disabled:
    "NaviPet's Elbee. The live model is off. Cards are verified campus records, not a model reply. This is not the university parking chatbot.",
  mock: "NaviPet's Elbee test model. Not a live Anthropic call. This is not the university parking chatbot.",
  anthropic:
    "NaviPet's Elbee is an AI assistant for CSULB campus places. It is not the university parking chatbot. Tap a card to start navigation.",
} as const;

const STATUSES = new Set<string>([
  'ok',
  'ambiguous',
  'no_match',
  'off_topic',
  'budget_exhausted',
  'consent_required',
  'unavailable',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCard(value: unknown): value is DestinationCard {
  if (!isRecord(value)) return false;
  return (
    typeof value.placeId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.subtitle === 'string' &&
    (value.buildingCode === null || typeof value.buildingCode === 'string') &&
    (value.roomNumber === null || typeof value.roomNumber === 'string') &&
    (value.floor === null || typeof value.floor === 'string') &&
    typeof value.source === 'string' &&
    (value.indoor === 'door_pose' || value.indoor === 'none') &&
    typeof value.indoorNote === 'string' &&
    value.provenanceUrl === null
  );
}

/** Rebuilds a stored reply so a replay cannot grow new fields. */
export function restoreElbeeResponse(value: unknown): ElbeeResponse | null {
  if (!isRecord(value)) return null;
  const provider = value.provider;
  const status = value.status;
  if (
    (provider !== 'disabled' && provider !== 'mock' && provider !== 'anthropic') ||
    typeof value.liveModel !== 'boolean' ||
    typeof value.modelOutputAccepted !== 'boolean' ||
    typeof status !== 'string' ||
    !STATUSES.has(status) ||
    typeof value.disclosure !== 'string' ||
    typeof value.explanation !== 'string' ||
    !(value.clarifyingQuestion === null || typeof value.clarifyingQuestion === 'string') ||
    !Array.isArray(value.cards) ||
    !value.cards.every(isCard)
  ) {
    return null;
  }
  const parking = value.parking;
  const nextClass = value.nextClass;
  if (parking !== null && !isRecord(parking)) return null;
  if (nextClass !== null && !isRecord(nextClass)) return null;
  const parkingAnswer = parking === null ? null : restoreParking(parking);
  if (parking !== null && parkingAnswer === null) return null;
  if (
    nextClass !== null &&
    (typeof nextClass.courseCode !== 'string' ||
      typeof nextClass.startTime !== 'string' ||
      typeof nextClass.endTime !== 'string' ||
      !(nextClass.placeId === null || typeof nextClass.placeId === 'string'))
  ) {
    return null;
  }
  return {
    provider,
    liveModel: value.liveModel,
    modelOutputAccepted: value.modelOutputAccepted,
    status: status as ElbeeStatus,
    disclosure: value.disclosure,
    explanation: value.explanation,
    clarifyingQuestion: value.clarifyingQuestion,
    cards: value.cards.slice(0, 4),
    parking: parkingAnswer,
    nextClass:
      nextClass === null
        ? null
        : {
            courseCode: nextClass.courseCode as string,
            startTime: nextClass.startTime as string,
            endTime: nextClass.endTime as string,
            placeId: nextClass.placeId as string | null,
          },
  };
}

function restoreParking(value: Record<string, unknown>): ParkingAnswer | null {
  if (value.authoritative !== false || typeof value.disclaimer !== 'string') return null;
  if (!(value.unavailableReason === null || typeof value.unavailableReason === 'string')) return null;
  if (!Array.isArray(value.rules)) return null;
  const rules: ParkingRule[] = [];
  for (const rule of value.rules) {
    if (!isRecord(rule)) return null;
    if (
      typeof rule.ruleId !== 'string' ||
      typeof rule.text !== 'string' ||
      typeof rule.sourceUrl !== 'string' ||
      rule.retrievedAt !== '2026-11-10'
    ) {
      return null;
    }
    rules.push({
      ruleId: rule.ruleId,
      text: rule.text,
      sourceUrl: rule.sourceUrl,
      retrievedAt: '2026-11-10',
    });
  }
  return {
    authoritative: false,
    disclaimer: value.disclaimer,
    unavailableReason: value.unavailableReason,
    rules,
  };
}
