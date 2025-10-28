/**
 * @fileoverview Generic base repository for database operations with full type safety
 * @module core/abstractions/BaseRepository
 */

import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { Logger } from 'pino';
import { trace, type Span } from '@opentelemetry/api';
import type { z } from 'zod';

import type {
  PaginationParams,
  PaginatedResponse,
  Filter,
  Result,
  Nullable,
  Brand,
} from '../types';

/**
 * Entity ID type
 */
export type EntityId = Brand<string, 'EntityId'>;

/**
 * Database query options
 */
export interface QueryOptions {
  /** Database client (for transactions) */
  client?: PoolClient;
  /** Query timeout in milliseconds */
  timeout?: number;
  /** Whether to include soft-deleted records */
  includeSoftDeleted?: boolean;
}

/**
 * Transaction callback type
 * @template TResult - Transaction result type
 */
export type TransactionCallback<TResult> = (client: PoolClient) => Promise<TResult>;

/**
 * Repository interface with full generic types
 *
 * @template TEntity - Entity type
 * @template TId - ID type (defaults to EntityId)
 * @template TCreateDTO - Create DTO type
 * @template TUpdateDTO - Update DTO type
 */
export interface IRepository<
  TEntity,
  TId = EntityId,
  TCreateDTO = Partial<TEntity>,
  TUpdateDTO = Partial<TEntity>,
> {
  /**
   * Find entity by ID
   */
  findById(id: TId, options?: QueryOptions): Promise<Nullable<TEntity>>;

  /**
   * Find all entities with pagination
   */
  findAll(
    pagination: PaginationParams,
    filters?: Filter[],
    options?: QueryOptions
  ): Promise<PaginatedResponse<TEntity>>;

  /**
   * Find one entity by criteria
   */
  findOne(criteria: Partial<TEntity>, options?: QueryOptions): Promise<Nullable<TEntity>>;

  /**
   * Find many entities by criteria
   */
  findMany(criteria: Partial<TEntity>, options?: QueryOptions): Promise<TEntity[]>;

  /**
   * Create new entity
   */
  create(data: TCreateDTO, options?: QueryOptions): Promise<TEntity>;

  /**
   * Update existing entity
   */
  update(id: TId, data: TUpdateDTO, options?: QueryOptions): Promise<TEntity>;

  /**
   * Delete entity (soft delete if supported)
   */
  delete(id: TId, options?: QueryOptions): Promise<boolean>;

  /**
   * Hard delete entity (permanent)
   */
  hardDelete(id: TId, options?: QueryOptions): Promise<boolean>;

  /**
   * Check if entity exists
   */
  exists(id: TId, options?: QueryOptions): Promise<boolean>;

  /**
   * Count entities matching criteria
   */
  count(criteria?: Partial<TEntity>, options?: QueryOptions): Promise<number>;
}

/**
 * Abstract base repository implementing common database operations
 *
 * @template TEntity - Entity type
 * @template TId - ID type
 * @template TCreateDTO - Create DTO type
 * @template TUpdateDTO - Update DTO type
 * @template TSchema - Zod schema type for validation
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   email: string;
 *   name: string;
 *   createdAt: Date;
 * }
 *
 * const UserSchema = z.object({
 *   id: z.string().uuid(),
 *   email: z.string().email(),
 *   name: z.string(),
 *   createdAt: z.date(),
 * });
 *
 * class UserRepository extends BaseRepository<User, string, Omit<User, 'id'>, Partial<User>, typeof UserSchema> {
 *   protected readonly tableName = 'users';
 *   protected readonly schema = UserSchema;
 *   protected readonly idColumn = 'id';
 * }
 * ```
 */
export abstract class BaseRepository<
  TEntity extends Record<string, unknown>,
  TId = EntityId,
  TCreateDTO = Partial<TEntity>,
  TUpdateDTO = Partial<TEntity>,
  TSchema extends z.ZodType<TEntity> = z.ZodType<TEntity>,
> implements IRepository<TEntity, TId, TCreateDTO, TUpdateDTO>
{
  /**
   * Table name in database
   * Must be overridden by subclasses
   */
  protected abstract readonly tableName: string;

  /**
   * Primary key column name
   * Defaults to 'id'
   */
  protected readonly idColumn: string = 'id';

  /**
   * Zod schema for entity validation
   * Optional but recommended
   */
  protected readonly schema?: TSchema;

  /**
   * Whether soft delete is enabled
   * If true, delete operations will set deleted_at instead of removing records
   */
  protected readonly softDelete: boolean = false;

  /**
   * Soft delete column name
   */
  protected readonly deletedAtColumn: string = 'deleted_at';

  /**
   * Timestamp columns
   */
  protected readonly createdAtColumn: string = 'created_at';
  protected readonly updatedAtColumn: string = 'updated_at';

  /**
   * Tracer instance
   */
  private readonly tracer = trace.getTracer('repository');

  /**
   * Constructor
   *
   * @param pool - PostgreSQL connection pool
   * @param logger - Logger instance
   */
  constructor(
    protected readonly pool: Pool,
    protected readonly logger: Logger
  ) {}

  /**
   * Find entity by ID
   */
  async findById(id: TId, options: QueryOptions = {}): Promise<Nullable<TEntity>> {
    return this.trace('findById', async (span) => {
      span.setAttributes({
        'db.table': this.tableName,
        'db.operation': 'SELECT',
        'entity.id': String(id),
      });

      const query = this.buildSelectQuery({
        where: [`${this.idColumn} = $1`],
        limit: 1,
        includeSoftDeleted: options.includeSoftDeleted,
      });

      const result = await this.executeQuery<TEntity>(query, [id], options);
      const entity = result.rows[0] ?? null;

      if (!entity) {
        return null;
      }

      return this.validate(entity);
    });
  }

  /**
   * Find all entities with pagination
   */
  async findAll(
    pagination: PaginationParams,
    filters: Filter[] = [],
    options: QueryOptions = {}
  ): Promise<PaginatedResponse<TEntity>> {
    return this.trace('findAll', async (span) => {
      const { page, pageSize, sortBy, sortOrder } = pagination;
      const offset = (page - 1) * pageSize;

      span.setAttributes({
        'db.table': this.tableName,
        'db.operation': 'SELECT',
        'pagination.page': page,
        'pagination.pageSize': pageSize,
      });

      // Build WHERE clause from filters
      const { whereClause, values } = this.buildFilterClause(filters);

      // Count query
      const countQuery = this.buildSelectQuery({
        select: ['COUNT(*) as total'],
        where: whereClause,
        includeSoftDeleted: options.includeSoftDeleted,
      });
      const countResult = await this.executeQuery<{ total: string }>(countQuery, values, options);
      const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

      // Data query
      const dataQuery = this.buildSelectQuery({
        where: whereClause,
        orderBy: sortBy ? `${sortBy} ${sortOrder ?? 'ASC'}` : undefined,
        limit: pageSize,
        offset,
        includeSoftDeleted: options.includeSoftDeleted,
      });
      const dataResult = await this.executeQuery<TEntity>(dataQuery, values, options);

      const items = dataResult.rows.map((row) => this.validate(row));

      const totalPages = Math.ceil(total / pageSize);

      return {
        items,
        total,
        page,
        pageSize,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      };
    });
  }

  /**
   * Find one entity by criteria
   */
  async findOne(
    criteria: Partial<TEntity>,
    options: QueryOptions = {}
  ): Promise<Nullable<TEntity>> {
    return this.trace('findOne', async (span) => {
      const { whereClause, values } = this.buildCriteriaClause(criteria);

      span.setAttributes({
        'db.table': this.tableName,
        'db.operation': 'SELECT',
      });

      const query = this.buildSelectQuery({
        where: whereClause,
        limit: 1,
        includeSoftDeleted: options.includeSoftDeleted,
      });

      const result = await this.executeQuery<TEntity>(query, values, options);
      const entity = result.rows[0] ?? null;

      if (!entity) {
        return null;
      }

      return this.validate(entity);
    });
  }

  /**
   * Find many entities by criteria
   */
  async findMany(criteria: Partial<TEntity>, options: QueryOptions = {}): Promise<TEntity[]> {
    return this.trace('findMany', async (span) => {
      const { whereClause, values } = this.buildCriteriaClause(criteria);

      span.setAttributes({
        'db.table': this.tableName,
        'db.operation': 'SELECT',
      });

      const query = this.buildSelectQuery({
        where: whereClause,
        includeSoftDeleted: options.includeSoftDeleted,
      });

      const result = await this.executeQuery<TEntity>(query, values, options);

      return result.rows.map((row) => this.validate(row));
    });
  }

  /**
   * Create new entity
   */
  async create(data: TCreateDTO, options: QueryOptions = {}): Promise<TEntity> {
    return this.trace('create', async (span) => {
      const baseDataEntries = Object.entries(data as Record<string, unknown>).filter(
        ([key]) => key !== this.idColumn
      );

      const enrichedData: Record<string, unknown> = Object.fromEntries(baseDataEntries);

      enrichedData[this.createdAtColumn] = new Date();
      enrichedData[this.updatedAtColumn] = new Date();

      const entries = Object.entries(enrichedData);
      const columns = entries.map(([key]) => this.toColumnName(key));
      const values = entries.map(([, value]) => value);
      const placeholders = columns.map((_, i) => `$${i + 1}`);

      const query = `
        INSERT INTO ${this.tableName} (${columns.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING *
      `;

      span.setAttributes({
        'db.table': this.tableName,
        'db.operation': 'INSERT',
      });

      const result = await this.executeQuery<TEntity>(query, values, options);
      const entity = result.rows[0];

      if (!entity) {
        throw new Error(`Failed to create entity in ${this.tableName}`);
      }

      return this.validate(entity);
    });
  }

  /**
   * Update existing entity
   */
  async update(id: TId, data: TUpdateDTO, options: QueryOptions = {}): Promise<TEntity> {
    return this.trace('update', async (span) => {
      const baseDataEntries = Object.entries(data as Record<string, unknown>).filter(
        ([key]) => key !== this.idColumn
      );

      const enrichedData: Record<string, unknown> = Object.fromEntries(baseDataEntries);
      enrichedData[this.updatedAtColumn] = new Date();

      const entries = Object.entries(enrichedData);
      const setClause = entries
        .map(([key], i) => `${this.toColumnName(key)} = $${i + 1}`)
        .join(', ');
      const values = [...entries.map(([, value]) => value), id];

      const query = `
        UPDATE ${this.tableName}
        SET ${setClause}
        WHERE ${this.idColumn} = $${entries.length + 1}
        ${this.softDelete && !options.includeSoftDeleted ? `AND ${this.deletedAtColumn} IS NULL` : ''}
        RETURNING *
      `;

      span.setAttributes({
        'db.table': this.tableName,
        'db.operation': 'UPDATE',
        'entity.id': String(id),
      });

      const result = await this.executeQuery<TEntity>(query, values, options);
      const entity = result.rows[0];

      if (!entity) {
        throw new Error(`Entity not found in ${this.tableName} with id: ${String(id)}`);
      }

      return this.validate(entity);
    });
  }

  /**
   * Delete entity (soft delete if enabled)
   */
  async delete(id: TId, options: QueryOptions = {}): Promise<boolean> {
    if (this.softDelete) {
      return this.trace('softDelete', async (span) => {
        const query = `
          UPDATE ${this.tableName}
          SET ${this.deletedAtColumn} = $1
          WHERE ${this.idColumn} = $2
          AND ${this.deletedAtColumn} IS NULL
        `;

        span.setAttributes({
          'db.table': this.tableName,
          'db.operation': 'UPDATE',
          'operation.type': 'soft_delete',
          'entity.id': String(id),
        });

        const result = await this.executeQuery(query, [new Date(), id], options);
        return (result.rowCount ?? 0) > 0;
      });
    }

    return this.hardDelete(id, options);
  }

  /**
   * Hard delete entity (permanent)
   */
  async hardDelete(id: TId, options: QueryOptions = {}): Promise<boolean> {
    return this.trace('hardDelete', async (span) => {
      const query = `
        DELETE FROM ${this.tableName}
        WHERE ${this.idColumn} = $1
      `;

      span.setAttributes({
        'db.table': this.tableName,
        'db.operation': 'DELETE',
        'entity.id': String(id),
      });

      const result = await this.executeQuery(query, [id], options);
      return (result.rowCount ?? 0) > 0;
    });
  }

  /**
   * Check if entity exists
   */
  async exists(id: TId, options: QueryOptions = {}): Promise<boolean> {
    return this.trace('exists', async (span) => {
      const query = this.buildSelectQuery({
        select: [`${this.idColumn}`],
        where: [`${this.idColumn} = $1`],
        limit: 1,
        includeSoftDeleted: options.includeSoftDeleted,
      });

      span.setAttributes({
        'db.table': this.tableName,
        'db.operation': 'SELECT',
        'entity.id': String(id),
      });

      const result = await this.executeQuery(query, [id], options);
      return (result.rowCount ?? 0) > 0;
    });
  }

  /**
   * Count entities matching criteria
   */
  async count(criteria: Partial<TEntity> = {}, options: QueryOptions = {}): Promise<number> {
    return this.trace('count', async (span) => {
      const { whereClause, values } = this.buildCriteriaClause(criteria);

      const query = this.buildSelectQuery({
        select: ['COUNT(*) as count'],
        where: whereClause,
        includeSoftDeleted: options.includeSoftDeleted,
      });

      span.setAttributes({
        'db.table': this.tableName,
        'db.operation': 'SELECT',
      });

      const result = await this.executeQuery<{ count: string }>(query, values, options);
      return parseInt(result.rows[0]?.count ?? '0', 10);
    });
  }

  /**
   * Execute within a transaction
   */
  async transaction<TResult>(callback: TransactionCallback<TResult>): Promise<TResult> {
    return this.trace('transaction', async (span) => {
      const client = await this.pool.connect();

      try {
        await client.query('BEGIN');
        span.addEvent('transaction.begin');

        const result = await callback(client);

        await client.query('COMMIT');
        span.addEvent('transaction.commit');

        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        span.addEvent('transaction.rollback');
        throw error;
      } finally {
        client.release();
      }
    });
  }

  /**
   * Build SELECT query
   */
  protected buildSelectQuery(options: {
    select?: string[];
    where?: string[];
    orderBy?: string;
    limit?: number;
    offset?: number;
    includeSoftDeleted?: boolean;
  }): string {
    const {
      select = ['*'],
      where = [],
      orderBy,
      limit,
      offset,
      includeSoftDeleted = false,
    } = options;

    const normalizedSelect = select.map((field) =>
      field === '*' || field.includes('(') || field.includes(' ') ? field : this.toColumnName(field)
    );

    const whereConditions = [...where];
    if (this.softDelete && !includeSoftDeleted) {
      whereConditions.push(`${this.deletedAtColumn} IS NULL`);
    }

    let query = `SELECT ${normalizedSelect.join(', ')} FROM ${this.tableName}`;

    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    if (orderBy) {
      query += ` ORDER BY ${this.toOrderByClause(orderBy)}`;
    }

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    if (offset) {
      query += ` OFFSET ${offset}`;
    }

    return query;
  }

  /**
   * Build criteria WHERE clause
   */
  protected buildCriteriaClause(criteria: Partial<TEntity>): {
    whereClause: string[];
    values: unknown[];
  } {
    const entries = Object.entries(criteria);
    const whereClause = entries.map(([key], i) => `${this.toColumnName(key)} = $${i + 1}`);
    const values = entries.map(([, value]) => value);

    return { whereClause, values };
  }

  /**
   * Build filter WHERE clause
   */
  protected buildFilterClause(filters: Filter[]): {
    whereClause: string[];
    values: unknown[];
  } {
    const whereClause: string[] = [];
    const values: unknown[] = [];

    filters.forEach((filter, index) => {
      const paramIndex = index + 1;
      switch (filter.operator) {
        case 'eq':
          whereClause.push(`${this.toColumnName(filter.field)} = $${paramIndex}`);
          values.push(filter.value);
          break;
        case 'ne':
          whereClause.push(`${this.toColumnName(filter.field)} != $${paramIndex}`);
          values.push(filter.value);
          break;
        case 'gt':
          whereClause.push(`${this.toColumnName(filter.field)} > $${paramIndex}`);
          values.push(filter.value);
          break;
        case 'gte':
          whereClause.push(`${this.toColumnName(filter.field)} >= $${paramIndex}`);
          values.push(filter.value);
          break;
        case 'lt':
          whereClause.push(`${this.toColumnName(filter.field)} < $${paramIndex}`);
          values.push(filter.value);
          break;
        case 'lte':
          whereClause.push(`${this.toColumnName(filter.field)} <= $${paramIndex}`);
          values.push(filter.value);
          break;
        case 'in':
          whereClause.push(`${this.toColumnName(filter.field)} = ANY($${paramIndex})`);
          values.push(filter.value);
          break;
        case 'notIn':
          whereClause.push(`${this.toColumnName(filter.field)} != ALL($${paramIndex})`);
          values.push(filter.value);
          break;
        case 'contains':
          whereClause.push(`${this.toColumnName(filter.field)} ILIKE $${paramIndex}`);
          values.push(`%${filter.value}%`);
          break;
        case 'startsWith':
          whereClause.push(`${this.toColumnName(filter.field)} ILIKE $${paramIndex}`);
          values.push(`${filter.value}%`);
          break;
        case 'endsWith':
          whereClause.push(`${this.toColumnName(filter.field)} ILIKE $${paramIndex}`);
          values.push(`%${filter.value}`);
          break;
        case 'isNull':
          whereClause.push(`${this.toColumnName(filter.field)} IS NULL`);
          break;
        case 'isNotNull':
          whereClause.push(`${this.toColumnName(filter.field)} IS NOT NULL`);
          break;
      }
    });

    return { whereClause, values };
  }

  /**
   * Execute query with proper error handling and logging
   */
  protected async executeQuery<TRow extends QueryResultRow = QueryResultRow>(
    query: string,
    values: unknown[] = [],
    options: QueryOptions = {}
  ): Promise<QueryResult<TRow>> {
    const client = options.client ?? this.pool;
    const startTime = Date.now();

    try {
      this.logger.debug({ query, values }, 'Executing query');

      const result = await client.query<TRow>(query, values);
      const duration = Date.now() - startTime;

      this.logger.debug(
        {
          query,
          duration,
          rowCount: result.rowCount,
        },
        'Query executed successfully'
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        {
          query,
          values,
          duration,
          error,
        },
        'Query execution failed'
      );

      throw error;
    }
  }

  /**
   * Validate entity with schema
   */
  protected validate(entity: unknown): TEntity {
    const normalized = this.normalizeRow(entity as Record<string, unknown>);

    if (!this.schema) {
      return normalized as TEntity;
    }

    return this.schema.parse(normalized);
  }

  /**
   * Trace repository operation
   */
  protected async trace<TResult>(
    operation: string,
    callback: (span: Span) => Promise<TResult>
  ): Promise<TResult> {
    const span = this.tracer.startSpan(`repository.${this.tableName}.${operation}`);

    try {
      const result = await callback(span);
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      throw error;
    } finally {
      span.end();
    }
  }

  private toOrderByClause(orderBy: string): string {
    const parts = orderBy.trim().split(/\s+/);
    const column = this.toColumnName(parts[0]);

    if (parts.length > 1) {
      return `${column} ${parts.slice(1).join(' ')}`;
    }

    return column;
  }

  /**
   * Normalize database row keys to entity property names
   */
  private normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      normalized[this.toPropertyName(key)] = value;
    }

    return normalized;
  }

  /**
   * Convert entity property to database column name (snake_case)
   */
  private toColumnName(property: string): string {
    if (property.includes('_')) {
      return property;
    }

    return property.replace(/([A-Z])/g, '_$1').toLowerCase();
  }

  /**
   * Convert database column name to entity property name (camelCase)
   */
  private toPropertyName(column: string): string {
    return column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }
}
