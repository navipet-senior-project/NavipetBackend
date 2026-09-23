import type { ErrorCode } from './error-codes.js';

export interface AppErrorOptions {
  code: ErrorCode;
  statusCode: number;
  message: string;
  cause?: unknown;
  /** Extra client-safe fields merged into the error body. Dropped on 5xx. */
  details?: Readonly<Record<string, unknown>>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly originalCause: unknown;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.originalCause = options.cause;
    this.details = options.details;
  }
}
