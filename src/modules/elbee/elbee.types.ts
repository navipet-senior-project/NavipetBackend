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
