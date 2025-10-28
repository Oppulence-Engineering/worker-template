/**
 * @fileoverview Central export point for all base abstractions
 * @module core/abstractions
 */

export { BaseJob } from './BaseJob';
export { BaseRepository, type IRepository, type QueryOptions, type TransactionCallback, type EntityId } from './BaseRepository';
export { BaseService, ServiceError, type ServiceDependencies, type ServiceContext } from './BaseService';
export {
  BaseMiddleware,
  MiddlewarePipeline,
  compose,
  type IMiddleware,
  type MiddlewareContext,
  type MiddlewareFunction,
  type NextFunction,
} from './BaseMiddleware';
