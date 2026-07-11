export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'DUPLICATE_CODE'
  | 'DUPLICATE_NAME'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'ORG_NOT_CONFIGURED';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
