export interface ClassRecord {
  id: string;
  courseCode: string;
  courseName: string;
  building: string;
  room: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClassInput {
  courseCode: string;
  courseName: string;
  building: string;
  room?: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  /** Resolved by the campus service; not accepted from the public API. */
  latitude?: number;
  /** Resolved by the campus service; not accepted from the public API. */
  longitude?: number;
}

export type UpdateClassInput = Partial<CreateClassInput>;

/**
 * Time fields as the API accepts them: a CSULB range in `time`, or a start
 * and end in 24-hour or AM/PM form. The service normalizes them to the
 * 24-hour `startTime`/`endTime` of `CreateClassInput`.
 */
export interface ClassTimeRequest {
  time?: string;
  startTime?: string;
  endTime?: string;
}

export type CreateClassRequest =
  Omit<CreateClassInput, 'startTime' | 'endTime' | 'latitude' | 'longitude'> & ClassTimeRequest;

export type UpdateClassRequest = Partial<CreateClassRequest>;

export interface ClassesGateway {
  listClasses(accessToken: string): Promise<ClassRecord[]>;
  createClass(accessToken: string, userId: string, input: CreateClassInput): Promise<ClassRecord>;
  updateClass(accessToken: string, classId: string, input: UpdateClassInput): Promise<ClassRecord | null>;
  deleteClass(accessToken: string, classId: string): Promise<boolean>;
}
