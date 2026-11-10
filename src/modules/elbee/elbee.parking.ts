import type { ParkingAnswer, ParkingRule } from './elbee.types.js';

const RETRIEVED_AT = '2026-11-10' as const;
const REGULATIONS =
  'https://www.csulb.edu/parking-and-transportation-services/permit-information-regulations';
const FAQ = 'https://www.csulb.edu/parking-and-transportation-services/parking-faq';
const TIPS = 'https://www.csulb.edu/parking-and-transportation-services/parking-tips';
const HOME = 'https://www.csulb.edu/parking-and-transportation-services';

export const PARKING_DISCLAIMER =
  'This is dated, source-cited information, not permission to park. Confirm your permit and the posted sign. NaviPet does not decide parking eligibility from an account role and has no live space count.';

export type ParkingTopic =
  | 'overview'
  | 'student_permit'
  | 'employee_permit'
  | 'daily_permit'
  | 'overflow'
  | 'short_term';

function rule(ruleId: string, text: string, sourceUrl: string): ParkingRule {
  return { ruleId, text, sourceUrl, retrievedAt: RETRIEVED_AT };
}

function answer(rules: ParkingRule[], unavailableReason: string | null): ParkingAnswer {
  return {
    authoritative: false,
    disclaimer: PARKING_DISCLAIMER,
    unavailableReason,
    rules,
  };
}

const TOPICS: Record<ParkingTopic, ParkingAnswer> = {
  overview: answer(
    [
      rule(
        'pts-overview',
        'Parking permission is a purchased permit plus posted signs. NaviPet does not treat an account role as a permit, and it has no live space count.',
        HOME,
      ),
    ],
    null,
  ),
  student_permit: answer(
    [
      rule(
        'student-permit-regulations',
        'The permit regulations page says a student semester, monthly, or academic-year permit may be purchased through the Online Parking Portal or the Cashiers Office in Brotman Hall. It is valid in general (G) lots and the three structures at any time, and in employee (E) lots after 5:30 p.m. Monday-Friday and all day on weekends, unless posted signs restrict the space.',
        REGULATIONS,
      ),
      rule(
        'student-permit-faq',
        'The parking FAQ says student semester, monthly, and academic-year permits are purchased online. The two official pages do not use the same purchase wording. Confirm with Parking and Transportation Services.',
        FAQ,
      ),
    ],
    null,
  ),
  employee_permit: answer(
    [
      rule(
        'employee-permit-regulations',
        'The permit regulations page says an employee permit is valid in employee (E) or general (G) lots and the three structures, and in short-term spaces after 5:30 p.m. Friday through 11:59 p.m. Sunday, unless posted signs restrict the space. A NaviPet account role is not this permit.',
        REGULATIONS,
      ),
    ],
    null,
  ),
  daily_permit: answer(
    [
      rule(
        'daily-permit-regulations',
        'The permit regulations page says a daily permit is valid in general (G) lots and the three structures, and in employee (E) lots after 5:30 p.m. Monday-Friday and all day on weekends. It expires at 11:59 p.m. on the purchase date and is not valid in resident lots or Beachside. Posted signs still restrict spaces.',
        REGULATIONS,
      ),
    ],
    null,
  ),
  overflow: answer(
    [
      rule(
        'overflow-fall-2026',
        'The Fall 2026 overflow lot is closed as of Thursday, September 24, 2026. Existing overflow permits remain valid on campus where a semester permit is valid and expire January 17, 2027. The older first-five-weeks wording is not a reason to treat the lot as open.',
        REGULATIONS,
      ),
    ],
    null,
  ),
  short_term: answer(
    [
      rule(
        'short-term-regulations',
        'Read the short-term section on the permit regulations page. Do not combine it with the tips page into one lot list.',
        REGULATIONS,
      ),
      rule(
        'short-term-tips',
        'Read the short-term lots on the parking tips page. Do not combine it with the regulations page into one lot list.',
        TIPS,
      ),
    ],
    'The regulations page and the parking tips page list different short-term lots. NaviPet will not merge those lists.',
  ),
};

export function parkingForTopic(topic: ParkingTopic): ParkingAnswer {
  return TOPICS[topic];
}

export function parkingTopicFromQuestion(question: string): ParkingTopic | null {
  const text = question.toLocaleLowerCase('en-US');
  const mentionsParking = /\b(parking|permit|park)\b/.test(text);
  if (!mentionsParking && !/\boverflow\b/.test(text)) return null;
  if (/\boverflow\b/.test(text)) return 'overflow';
  if (/\bshort[ -]?term\b/.test(text)) return 'short_term';
  if (/\bstudent\b/.test(text) && /\bpermit\b/.test(text)) return 'student_permit';
  if (/\b(employee|faculty|staff)\b/.test(text) && /\bpermit\b/.test(text)) return 'employee_permit';
  if (/\bdaily\b/.test(text) && /\b(permit|parking)\b/.test(text)) return 'daily_permit';
  return 'overview';
}
