/**
 * @fileoverview Integration tests for BaseRepository with PostgreSQL
 * @module tests/integration/repository
 *
 * NOTE: These tests require Docker to be running for testcontainers.
 * They will automatically start a PostgreSQL container and clean it up.
 *
 * These tests are skipped by default to avoid failures on hosts without the
 * required native dependencies. To opt-in:
 *
 * RUN_INTEGRATION_TESTS=true bun test tests/integration/
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { z } from 'zod';
import { BaseRepository } from '../../src/core/abstractions/BaseRepository';
import {
  initializePostgresContainer,
  cleanupTestContainers,
  testPool,
  createTestLogger,
} from '../setup';

// Integration tests are opt-in to avoid native dependency issues on developer machines.
const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
const useTestcontainers = process.env.USE_TESTCONTAINERS === 'true';

// Test entity
interface User {
  id: string;
  email: string;
  name: string;
  age: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  age: z.number().int().min(0),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Test repository implementation
class UserRepository extends BaseRepository<
  User,
  string,
  Omit<User, 'id' | 'createdAt' | 'updatedAt'>,
  Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>,
  typeof UserSchema
> {
  protected readonly tableName = 'users';
  protected readonly idColumn = 'id';
  protected readonly schema = UserSchema;
}

const describeIntegration = shouldRunIntegration ? describe : describe.skip;
const itWithTransactions = useTestcontainers ? it : it.skip;

describeIntegration('integration: BaseRepository', () => {
  let userRepo: UserRepository;

  beforeAll(async () => {
    // Initialize PostgreSQL testcontainer
    await initializePostgresContainer();

    if (!testPool) {
      throw new Error('Test pool not initialized');
    }

    // Create users table
    await testPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        age INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    userRepo = new UserRepository(testPool, createTestLogger());
  }, 60000); // 60 second timeout for container startup

  afterAll(async () => {
    // Clean up containers
    await cleanupTestContainers();
  }, 30000);

  it('should create a new user', async () => {
    const userData = {
      email: 'test@example.com',
      name: 'Test User',
      age: 25,
      isActive: true,
    };

    const user = await userRepo.create(userData);

    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.name).toBe('Test User');
    expect(user.age).toBe(25);
    expect(user.isActive).toBe(true);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('should find user by ID', async () => {
    const userData = {
      email: 'findme@example.com',
      name: 'Find Me',
      age: 30,
      isActive: true,
    };

    const created = await userRepo.create(userData);
    const found = await userRepo.findById(created.id);

    expect(found).toBeDefined();
    expect(found?.id).toBe(created.id);
    expect(found?.email).toBe('findme@example.com');
  });

  it('should return null for non-existent user', async () => {
    const notFound = await userRepo.findById('00000000-0000-0000-0000-000000000000');
    expect(notFound).toBeNull();
  });

  it('should update user', async () => {
    const userData = {
      email: 'update@example.com',
      name: 'Original Name',
      age: 20,
      isActive: true,
    };

    const created = await userRepo.create(userData);
    const updated = await userRepo.update(created.id, { name: 'Updated Name', age: 21 });

    expect(updated.name).toBe('Updated Name');
    expect(updated.age).toBe(21);
    expect(updated.email).toBe('update@example.com'); // Unchanged
    expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
  });

  it('should find one user by criteria', async () => {
    const userData = {
      email: 'unique@example.com',
      name: 'Unique User',
      age: 35,
      isActive: true,
    };

    await userRepo.create(userData);
    const found = await userRepo.findOne({ email: 'unique@example.com' });

    expect(found).toBeDefined();
    expect(found?.name).toBe('Unique User');
  });

  it('should find many users by criteria', async () => {
    await userRepo.create({
      email: 'active1@example.com',
      name: 'Active 1',
      age: 25,
      isActive: true,
    });
    await userRepo.create({
      email: 'active2@example.com',
      name: 'Active 2',
      age: 26,
      isActive: true,
    });
    await userRepo.create({
      email: 'inactive@example.com',
      name: 'Inactive',
      age: 27,
      isActive: false,
    });

    const activeUsers = await userRepo.findMany({ isActive: true });

    expect(activeUsers.length).toBeGreaterThanOrEqual(2);
    expect(activeUsers.every((u) => u.isActive)).toBe(true);
  });

  it('should count users', async () => {
    const count = await userRepo.count();
    expect(count).toBeGreaterThan(0);
  });

  it('should count users by criteria', async () => {
    const activeCount = await userRepo.count({ isActive: true });
    expect(activeCount).toBeGreaterThan(0);
  });

  it('should check if user exists', async () => {
    const userData = {
      email: 'exists@example.com',
      name: 'Exists',
      age: 30,
      isActive: true,
    };

    const created = await userRepo.create(userData);
    const exists = await userRepo.exists(created.id);

    expect(exists).toBe(true);
  });

  it('should return false for non-existent user', async () => {
    const exists = await userRepo.exists('00000000-0000-0000-0000-000000000000');
    expect(exists).toBe(false);
  });

  itWithTransactions('should execute transaction', async () => {
    if (!testPool) {
      throw new Error('Test pool not initialized');
    }

    const result = await userRepo.transaction(async (client) => {
      // Create two users in a transaction
      const user1 = await client.query(
        'INSERT INTO users (email, name, age, is_active) VALUES ($1, $2, $3, $4) RETURNING *',
        ['tx1@example.com', 'TX User 1', 25, true]
      );

      const user2 = await client.query(
        'INSERT INTO users (email, name, age, is_active) VALUES ($1, $2, $3, $4) RETURNING *',
        ['tx2@example.com', 'TX User 2', 26, true]
      );

      return { user1: user1.rows[0], user2: user2.rows[0] };
    });

    expect(result.user1).toBeDefined();
    expect(result.user2).toBeDefined();

    // Verify both users were created
    const found1 = await userRepo.findOne({ email: 'tx1@example.com' });
    const found2 = await userRepo.findOne({ email: 'tx2@example.com' });

    expect(found1).toBeDefined();
    expect(found2).toBeDefined();
  });

  itWithTransactions('should rollback transaction on error', async () => {
    let error: Error | null = null;

    try {
      await userRepo.transaction(async (client) => {
        await client.query(
          'INSERT INTO users (email, name, age, is_active) VALUES ($1, $2, $3, $4)',
          ['rollback@example.com', 'Rollback User', 25, true]
        );

        // This should cause an error and trigger rollback
        throw new Error('Intentional error to trigger rollback');
      });
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toBe('Intentional error to trigger rollback');

    // Verify user was not created (transaction was rolled back)
    const notFound = await userRepo.findOne({ email: 'rollback@example.com' });
    expect(notFound).toBeNull();
  });

  it('should handle pagination', async () => {
    // Create multiple users for pagination test
    for (let i = 0; i < 5; i++) {
      await userRepo.create({
        email: `page${i}@example.com`,
        name: `Page User ${i}`,
        age: 20 + i,
        isActive: true,
      });
    }

    const page1 = await userRepo.findAll({ page: 1, pageSize: 2 });

    expect(page1.items.length).toBe(2);
    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(2);
    expect(page1.total).toBeGreaterThanOrEqual(5);
    expect(page1.hasNext).toBe(true);
    expect(page1.hasPrevious).toBe(false);

    const page2 = await userRepo.findAll({ page: 2, pageSize: 2 });

    expect(page2.page).toBe(2);
    expect(page2.hasPrevious).toBe(true);
  });
});
