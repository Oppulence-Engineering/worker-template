/**
 * @fileoverview API-related generic types for PostGraphile and HTTP handling
 * @module core/types/api
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { Pool, PoolClient } from 'pg';
import type { Logger } from 'pino';
import type { z } from 'zod';

import type { Brand, Prettify, AsyncFunction, Result, JsonObject, Nullable } from './common.types';

/**
 * User ID - branded string for type safety
 */
export type UserId = Brand<string, 'UserId'>;

/**
 * Session ID - branded string for type safety
 */
export type SessionId = Brand<string, 'SessionId'>;

/**
 * API Key - branded string for type safety
 */
export type ApiKey = Brand<string, 'ApiKey'>;

/**
 * JWT Token - branded string for type safety
 */
export type JwtToken = Brand<string, 'JwtToken'>;

/**
 * HTTP methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

/**
 * HTTP status codes
 */
export type HttpStatusCode = number;

/**
 * Common HTTP status codes as branded types
 */
export type StatusOK = Brand<200, 'StatusOK'>;
export type StatusCreated = Brand<201, 'StatusCreated'>;
export type StatusNoContent = Brand<204, 'StatusNoContent'>;
export type StatusBadRequest = Brand<400, 'StatusBadRequest'>;
export type StatusUnauthorized = Brand<401, 'StatusUnauthorized'>;
export type StatusForbidden = Brand<403, 'StatusForbidden'>;
export type StatusNotFound = Brand<404, 'StatusNotFound'>;
export type StatusConflict = Brand<409, 'StatusConflict'>;
export type StatusInternalServerError = Brand<500, 'StatusInternalServerError'>;

/**
 * Generic HTTP headers interface
 */
export interface HttpHeaders {
  [header: string]: string | string[] | undefined;
}

/**
 * Typed request interface with generics
 * @template TBody - Request body type
 * @template TParams - Route parameters type
 * @template TQuery - Query string parameters type
 * @template THeaders - Custom headers type
 */
export interface TypedRequest<
  TBody = unknown,
  TParams = Record<string, string>,
  TQuery = Record<string, string>,
  THeaders extends HttpHeaders = HttpHeaders,
> extends IncomingMessage {
  /** Request body (parsed) */
  body: TBody;
  /** Route parameters */
  params: TParams;
  /** Query string parameters */
  query: TQuery;
  /** HTTP headers */
  headers: THeaders;
  /** Request method */
  method: HttpMethod;
  /** Request URL */
  url: string;
  /** Request path */
  path: string;
}

/**
 * Typed response interface with generics
 * @template TBody - Response body type
 */
export interface TypedResponse<TBody = unknown> extends ServerResponse {
  /**
   * Send JSON response
   * @param data - Response data
   * @param statusCode - HTTP status code
   */
  json(data: TBody, statusCode?: HttpStatusCode): void;

  /**
   * Send error response
   * @param error - Error object
   * @param statusCode - HTTP status code
   */
  error(error: Error, statusCode?: HttpStatusCode): void;

  /**
   * Set response status code
   * @param code - HTTP status code
   */
  status(code: HttpStatusCode): this;
}

/**
 * GraphQL context interface with generic user and extensions
 * @template TUser - User type
 * @template TExtensions - Additional context extensions
 */
export interface GraphQLContext<TUser = unknown, TExtensions = Record<string, unknown>> {
  /** Database connection pool */
  pgPool: Pool;
  /** Database client for current request */
  pgClient: PoolClient;
  /** Authenticated user (null if not authenticated) */
  user: Nullable<TUser>;
  /** Request logger */
  logger: Logger;
  /** JWT claims */
  jwtClaims: Nullable<JwtClaims>;
  /** Session ID */
  sessionId: Nullable<SessionId>;
  /** Request ID for tracing */
  requestId: string;
  /** HTTP request object */
  req: IncomingMessage;
  /** HTTP response object */
  res: ServerResponse;
  /** Additional context extensions */
  extensions: TExtensions;
}

/**
 * JWT claims interface
 */
export interface JwtClaims extends Record<string, unknown> {
  /** Subject (user ID) */
  sub: UserId;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
  /** Issuer */
  iss?: string;
  /** Audience */
  aud?: string | string[];
  /** JWT ID */
  jti?: string;
  /** User roles */
  roles?: string[];
  /** Custom claims */
  [key: string]: unknown;
}

/**
 * User role type
 */
export type UserRole = Brand<string, 'UserRole'>;

/**
 * Permission type
 */
export type Permission = Brand<string, 'Permission'>;

/**
 * Generic user interface
 * @template TRoles - User roles type
 */
export interface IUser<TRoles extends readonly UserRole[] = readonly UserRole[]> {
  /** User ID */
  id: UserId;
  /** User email */
  email: string;
  /** User roles */
  roles: TRoles;
  /** Whether user is active */
  isActive: boolean;
  /** User creation timestamp */
  createdAt: Date;
  /** User last updated timestamp */
  updatedAt: Date;
}

/**
 * Authentication result type
 * @template TUser - User type
 */
export type AuthResult<TUser> = Result<{ user: TUser; token: JwtToken }, AuthError>;

/**
 * Authentication error types
 */
export type AuthErrorType =
  | 'INVALID_CREDENTIALS'
  | 'USER_NOT_FOUND'
  | 'USER_INACTIVE'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'INSUFFICIENT_PERMISSIONS';

/**
 * Authentication error interface
 */
export interface AuthError extends Error {
  type: AuthErrorType;
  statusCode: HttpStatusCode;
}

/**
 * GraphQL resolver function type
 * @template TSource - Parent/source type
 * @template TArgs - Resolver arguments type
 * @template TContext - GraphQL context type
 * @template TReturn - Resolver return type
 */
export type GraphQLResolver<
  TSource = unknown,
  TArgs = Record<string, unknown>,
  TContext = GraphQLContext,
  TReturn = unknown,
> = (source: TSource, args: TArgs, context: TContext, info: unknown) => Promise<TReturn> | TReturn;

/**
 * GraphQL field resolver map
 * @template TSource - Source type
 * @template TContext - Context type
 */
export type GraphQLFieldResolvers<TSource = unknown, TContext = GraphQLContext> = {
  [field: string]: GraphQLResolver<TSource, unknown, TContext, unknown>;
};

/**
 * GraphQL resolver map with type safety
 * @template TResolvers - Map of type name to field resolvers
 * @template TContext - Context type
 */
export type GraphQLResolverMap<
  TResolvers extends Record<string, GraphQLFieldResolvers>,
  TContext = GraphQLContext,
> = {
  [K in keyof TResolvers]: TResolvers[K];
};

/**
 * PostGraphile plugin interface
 * @template TContext - GraphQL context type
 */
export interface PostGraphilePlugin<TContext = GraphQLContext> {
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Plugin initialization */
  init?(builder: unknown): void;
}

/**
 * PostGraphile smart comment type
 */
export type SmartComment<T extends string = string> = {
  [K in `@${T}`]: string;
};

/**
 * API response wrapper
 * @template TData - Response data type
 * @template TMeta - Response metadata type
 */
export interface ApiResponse<TData = unknown, TMeta = Record<string, unknown>> {
  /** Response data */
  data: TData;
  /** Response metadata */
  meta?: TMeta;
  /** Request timestamp */
  timestamp: string;
  /** Request ID */
  requestId: string;
}

/**
 * API error response
 */
export interface ApiErrorResponse {
  /** Error message */
  message: string;
  /** Error code */
  code: string;
  /** HTTP status code */
  statusCode: HttpStatusCode;
  /** Error details */
  details?: JsonObject;
  /** Request ID */
  requestId: string;
  /** Error timestamp */
  timestamp: string;
  /** Error stack (development only) */
  stack?: string;
}

/**
 * Paginated response interface
 * @template TData - Data item type
 */
export interface PaginatedResponse<TData = unknown> {
  /** Data items */
  items: TData[];
  /** Total count */
  total: number;
  /** Current page */
  page: number;
  /** Page size */
  pageSize: number;
  /** Total pages */
  totalPages: number;
  /** Has next page */
  hasNext: boolean;
  /** Has previous page */
  hasPrevious: boolean;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  /** Page number (1-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Sort field */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Filter operator types
 */
export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'isNull'
  | 'isNotNull';

/**
 * Generic filter interface
 * @template TField - Field name type
 * @template TValue - Value type
 */
export interface Filter<TField extends string = string, TValue = unknown> {
  /** Field to filter on */
  field: TField;
  /** Filter operator */
  operator: FilterOperator;
  /** Filter value */
  value: TValue;
}

/**
 * Route handler function type
 * @template TRequest - Request type
 * @template TResponse - Response type
 */
export type RouteHandler<
  TRequest extends TypedRequest = TypedRequest,
  TResponse extends TypedResponse = TypedResponse,
> = AsyncFunction<[TRequest, TResponse], void>;

/**
 * Middleware function type
 * @template TRequest - Request type
 * @template TResponse - Response type
 */
export type Middleware<
  TRequest extends TypedRequest = TypedRequest,
  TResponse extends TypedResponse = TypedResponse,
  TNext = () => Promise<void>,
> = AsyncFunction<[TRequest, TResponse, TNext], void>;

/**
 * API endpoint definition
 * @template TRequest - Request type
 * @template TResponse - Response body type
 */
export interface ApiEndpoint<TRequest extends TypedRequest = TypedRequest, TResponse = unknown> {
  /** HTTP method */
  method: HttpMethod;
  /** Endpoint path */
  path: string;
  /** Request schema for validation */
  requestSchema?: z.ZodType;
  /** Response schema */
  responseSchema?: z.ZodType<TResponse>;
  /** Route handler */
  handler: RouteHandler<TRequest, TypedResponse<TResponse>>;
  /** Middleware stack */
  middleware?: Middleware<TRequest>[];
  /** Whether authentication is required */
  requiresAuth?: boolean;
  /** Required permissions */
  permissions?: Permission[];
}

/**
 * REST resource interface
 * @template TEntity - Entity type
 * @template TCreateDTO - Create DTO type
 * @template TUpdateDTO - Update DTO type
 */
export interface RestResource<TEntity, TCreateDTO, TUpdateDTO> {
  /** List all resources */
  list(params: PaginationParams): Promise<PaginatedResponse<TEntity>>;
  /** Get resource by ID */
  get(id: string): Promise<TEntity>;
  /** Create new resource */
  create(data: TCreateDTO): Promise<TEntity>;
  /** Update existing resource */
  update(id: string, data: TUpdateDTO): Promise<TEntity>;
  /** Delete resource */
  delete(id: string): Promise<void>;
}

/**
 * WebSocket message type
 * @template TType - Message type identifier
 * @template TPayload - Message payload type
 */
export interface WebSocketMessage<TType extends string = string, TPayload = unknown> {
  /** Message type */
  type: TType;
  /** Message payload */
  payload: TPayload;
  /** Message ID */
  id?: string;
  /** Timestamp */
  timestamp?: string;
}

/**
 * Subscription handler type
 * @template TPayload - Subscription payload type
 * @template TContext - GraphQL context type
 */
export type SubscriptionHandler<TPayload = unknown, TContext = GraphQLContext> = {
  /** Subscribe function */
  subscribe: GraphQLResolver<unknown, unknown, TContext, AsyncIterator<TPayload>>;
  /** Resolve function */
  resolve?: (payload: TPayload) => unknown;
};

/**
 * GraphQL subscription event
 * @template TData - Event data type
 */
export interface SubscriptionEvent<TData = unknown> {
  /** Event topic */
  topic: string;
  /** Event data */
  data: TData;
  /** Event timestamp */
  timestamp: Date;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests */
  max: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Error message */
  message?: string;
  /** Status code to return */
  statusCode?: HttpStatusCode;
}

/**
 * CORS configuration
 */
export interface CorsConfig {
  /** Allowed origins */
  origin: string | string[] | RegExp;
  /** Allowed methods */
  methods?: HttpMethod[];
  /** Allowed headers */
  allowedHeaders?: string[];
  /** Exposed headers */
  exposedHeaders?: string[];
  /** Allow credentials */
  credentials?: boolean;
  /** Max age */
  maxAge?: number;
}

/**
 * API configuration
 */
export interface ApiConfig {
  /** Server port */
  port: number;
  /** Server host */
  host: string;
  /** CORS configuration */
  cors?: CorsConfig;
  /** Rate limiting */
  rateLimit?: RateLimitConfig;
  /** Enable GraphiQL */
  enableGraphiQL?: boolean;
  /** Enable introspection */
  enableIntrospection?: boolean;
  /** JWT secret */
  jwtSecret?: string;
  /** JWT token identifier */
  jwtTokenIdentifier?: string;
}

/**
 * Prettified API types
 */
export type PrettyGraphQLContext<T extends GraphQLContext> = Prettify<T>;
export type PrettyApiResponse<T extends ApiResponse> = Prettify<T>;
