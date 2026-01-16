/**
 * Shared TypeScript types for Guru Comment System
 * Used across frontend, backend, and API contracts
 */

/**
 * User type - represents a user in the system
 */
export interface User {
  id: string;
  username: string;
  type: 'local' | 'auth0';
  email?: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Discussion type - represents a discussion thread
 */
export interface Discussion {
  id: string;
  title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  deleted_at?: string | null;
}

/**
 * Comment type - represents a comment on a discussion
 */
export interface Comment {
  id: string;
  discussion_id: string;
  parent_comment_id?: string | null;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

/**
 * Attachment type - represents a file attachment to a comment
 */
export interface Attachment {
  id: string;
  comment_id: string;
  filename: string;
  mime_type: string;
  file_size: number;
  r2_key: string;
  created_at: string;
}

/**
 * Session type - represents an active user session
 */
export interface Session {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

/**
 * Request context type - attached to requests by middleware
 */
export interface RequestContext {
  user?: User;
  sessionId?: string;
  userId?: string;
  isAuthenticated: boolean;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit: number;
  offset: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Comment create request payload
 */
export interface CreateCommentPayload {
  discussion_id: string;
  parent_comment_id?: string;
  content: string;
}

/**
 * Comment update request payload
 */
export interface UpdateCommentPayload {
  content: string;
}

/**
 * Discussion create request payload
 */
export interface CreateDiscussionPayload {
  title: string;
}

/**
 * Discussion update request payload
 */
export interface UpdateDiscussionPayload {
  title?: string;
  is_archived?: boolean;
}

/**
 * File upload metadata
 */
export interface FileUploadMetadata {
  filename: string;
  mimeType: string;
  fileSize: number;
}

/**
 * Environment configuration
 */
export interface EnvironmentConfig {
  AUTH_ENABLED: boolean;
  MAX_ATTACHMENT_SIZE: number;
  RATE_LIMIT_ENABLED: boolean;
  APP_NAME: string;
  APP_LOGO_URL: string;
  BRAND_COLOR: string;
  AUTH0_DOMAIN?: string;
  AUTH0_CLIENT_ID?: string;
  AUTH0_CLIENT_SECRET?: string;
}
