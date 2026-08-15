import type { ErrorCode } from './error-codes.js';

export interface AppErrorOptions {
  code: ErrorCode;
  statusCode: number;
  message: string;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
  }
}
