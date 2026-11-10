import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { laClock } from './elbee.clock.js';

export interface BudgetReserveInput {
  userId: string;
  clientRequestId: string | null;
  micros: number;
  globalCapMicros: number;
  userCapMicros: number;
  now: Date;
}

export type BudgetReserveResult =
  | {
      ok: true;
      id: string;
      duplicate: boolean;
      pending: boolean;
    }
  | { ok: false; reason: 'exhausted' };

export interface BudgetLedger {
  reserve(input: BudgetReserveInput): Promise<BudgetReserveResult>;
  finish(
    reservationId: string,
    userId: string,
    status: 'settled' | 'released',
  ): Promise<void>;
}

interface MemoryRow {
  id: string;
  userId: string;
  clientRequestId: string | null;
  day: string;
  micros: number;
  status: 'reserved' | 'released' | 'settled';
}

export function createMemoryBudgetLedger(): BudgetLedger {
  let chain: Promise<void> = Promise.resolve();
  const rows: MemoryRow[] = [];

  function exclusive<T>(work: () => T): Promise<T> {
    const run = chain.then(work, work);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    reserve(input) {
      return exclusive(() => {
        const day = laClock(input.now).day;
        if (input.clientRequestId !== null) {
          const existing = rows.find(
            (row) =>
              row.userId === input.userId &&
              row.clientRequestId === input.clientRequestId &&
              row.day === day &&
              row.status !== 'released',
          );
          if (existing !== undefined) {
            return {
              ok: true as const,
              id: existing.id,
              duplicate: true,
              pending: existing.status === 'reserved',
            };
          }
        }
        const active = rows.filter((row) => row.day === day && row.status !== 'released');
        const globalSpent = active.reduce((sum, row) => sum + row.micros, 0);
        const userSpent = active
          .filter((row) => row.userId === input.userId)
          .reduce((sum, row) => sum + row.micros, 0);
        if (
          globalSpent + input.micros > input.globalCapMicros ||
          userSpent + input.micros > input.userCapMicros
        ) {
          return { ok: false as const, reason: 'exhausted' as const };
        }
        const row: MemoryRow = {
          id: randomUUID(),
          userId: input.userId,
          clientRequestId: input.clientRequestId,
          day,
          micros: input.micros,
          status: 'reserved',
        };
        rows.push(row);
        return {
          ok: true as const,
          id: row.id,
          duplicate: false,
          pending: false,
        };
      });
    },
    finish(reservationId, userId, status) {
      return exclusive(() => {
        const row = rows.find((item) => item.id === reservationId && item.userId === userId);
        if (row === undefined || row.status !== 'reserved') {
          throw new Error('elbee reservation not open');
        }
        row.status = status;
      });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createSupabaseBudgetLedger(admin: SupabaseClient): BudgetLedger {
  return {
    async reserve(input) {
      const response = (await admin.rpc('elbee_reserve_budget', {
        p_user_id: input.userId,
        p_client_request_id: input.clientRequestId,
        p_micros: input.micros,
        p_global_cap: input.globalCapMicros,
        p_user_cap: input.userCapMicros,
      })) as { data: unknown; error: { message: string } | null };
      if (response.error !== null) throw new Error('Elbee budget reserve failed');
      return parseReserve(response.data);
    },
    async finish(reservationId, userId, status) {
      const result = (await admin.rpc('elbee_finish_budget', {
        p_reservation_id: reservationId,
        p_user_id: userId,
        p_status: status,
      })) as { error: { message: string } | null };
      if (result.error !== null) throw new Error('Elbee budget finish failed');
    },
  };
}

function parseReserve(value: unknown): BudgetReserveResult {
  if (!isRecord(value)) throw new Error('elbee budget reserve was empty');
  if (value.ok === false && value.reason === 'exhausted') return { ok: false, reason: 'exhausted' };
  if (value.ok !== true || typeof value.id !== 'string' || typeof value.duplicate !== 'boolean') {
    throw new Error('elbee budget reserve was unreadable');
  }
  return {
    ok: true,
    id: value.id,
    duplicate: value.duplicate,
    pending: value.pending === true,
  };
}
