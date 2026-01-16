/**
 * Error handling framework for Guru Comment System
 * Standardized error responses and error classes
 */

export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ErrorDetail {
  field?: string;
  message: string;
}

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
}

export interface ErrorResponse {
  success: false;
  error: ErrorBody;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Custom error class for application errors
 * Extends Error with additional metadata for API responses
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: ErrorDetail[];

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 400,
    details?: ErrorDetail[]
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Create a standardized error response
 * @param error - AppError instance or ErrorCode
 * @param message - Optional custom error message
 * @param details - Optional error details array
 * @returns Standardized ErrorResponse object
 */
export function createErrorResponse(
  error: AppError | ErrorCode,
  message?: string,
  details?: ErrorDetail[]
): ErrorResponse {
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  return {
    success: false,
    error: {
      code: error,
      message: message || getErrorMessage(error),
      details,
    },
  };
}

/**
 * Get default error message for an error code
 * @param code - ErrorCode
 * @returns Default error message
 */
export function getErrorMessage(code: ErrorCode): string {
  const messages: Record<ErrorCode, string> = {
    [ErrorCode.UNAUTHORIZED]: 'Authentication required',
    [ErrorCode.FORBIDDEN]: 'You do not have permission to perform this action',
    [ErrorCode.NOT_FOUND]: 'Resource not found',
    [ErrorCode.BAD_REQUEST]: 'Invalid request',
    [ErrorCode.VALIDATION_ERROR]: 'Validation failed',
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',
    [ErrorCode.FILE_TOO_LARGE]: 'File size exceeds maximum allowed',
    [ErrorCode.INVALID_FILE_TYPE]: 'Invalid file type',
    [ErrorCode.INTERNAL_ERROR]: 'Internal server error',
  };

  return messages[code] || 'An error occurred';
}

/**
 * Handle errors and convert to appropriate HTTP responses
 * @param error - Unknown error object
 * @returns { response: Response, statusCode: number }
 */
export function handleError(error: unknown): {
  response: ErrorResponse;
  statusCode: number;
} {
  if (error instanceof AppError) {
    return {
      response: createErrorResponse(error),
      statusCode: error.statusCode,
    };
  }

  if (error instanceof Error) {
    console.error('Unhandled error:', error.message, error.stack);
    return {
      response: createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'An unexpected error occurred'
      ),
      statusCode: 500,
    };
  }

  console.error('Unknown error:', error);
  return {
    response: createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      'An unexpected error occurred'
    ),
    statusCode: 500,
  };
}

/**
 * Create a successful response
 * @param data - Response data
 * @returns SuccessResponse object
 */
export function createSuccessResponse<T>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
  };
}
