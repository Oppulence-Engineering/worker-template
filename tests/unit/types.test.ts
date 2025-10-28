/**
 * @fileoverview Unit tests for TypeScript generic types
 * @module tests/unit/types
 */

import { describe, it, expect } from 'bun:test';
import type {
  Brand,
  DeepPartial,
  Result,
  Option,
  Prettify,
  InferZodSchema,
} from '../../src/core/types';
import { z } from 'zod';

describe('unit: Generic Type Utilities', () => {
  describe('Brand Types', () => {
    it('should create branded types for domain concepts', () => {
      type UserId = Brand<string, 'UserId'>;
      type EmailAddress = Brand<string, 'EmailAddress'>;

      const userId: UserId = 'user-123' as UserId;
      const email: EmailAddress = 'test@example.com' as EmailAddress;

      // These should have runtime values but different compile-time types
      expect(typeof userId).toBe('string');
      expect(typeof email).toBe('string');
    });
  });

  describe('DeepPartial', () => {
    it('should make all nested properties optional', () => {
      interface NestedConfig {
        database: {
          host: string;
          port: number;
          credentials: {
            user: string;
            password: string;
          };
        };
        cache: {
          enabled: boolean;
        };
      }

      type PartialConfig = DeepPartial<NestedConfig>;

      const partial: PartialConfig = {
        database: {
          host: 'localhost',
          // port is optional
          credentials: {
            user: 'test',
            // password is optional
          },
        },
        // cache is optional
      };

      expect(partial.database?.host).toBe('localhost');
      expect(partial.database?.credentials?.user).toBe('test');
    });
  });

  describe('Result Type (Either Monad)', () => {
    it('should represent success with data', () => {
      const success: Result<number, Error> = {
        success: true,
        data: 42,
      };

      expect(success.success).toBe(true);
      if (success.success) {
        expect(success.data).toBe(42);
      }
    });

    it('should represent failure with error', () => {
      const failure: Result<number, Error> = {
        success: false,
        error: new Error('Something went wrong'),
      };

      expect(failure.success).toBe(false);
      if (!failure.success) {
        expect(failure.error.message).toBe('Something went wrong');
      }
    });

    it('should be useful for error handling', () => {
      function divide(a: number, b: number): Result<number, string> {
        if (b === 0) {
          return { success: false, error: 'Division by zero' };
        }
        return { success: true, data: a / b };
      }

      const result1 = divide(10, 2);
      const result2 = divide(10, 0);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);

      if (result1.success) {
        expect(result1.data).toBe(5);
      }

      if (!result2.success) {
        expect(result2.error).toBe('Division by zero');
      }
    });
  });

  describe('Option Type (Maybe Monad)', () => {
    it('should represent Some value', () => {
      const some: Option<number> = {
        kind: 'some',
        value: 42,
      };

      expect(some.kind).toBe('some');
      if (some.kind === 'some') {
        expect(some.value).toBe(42);
      }
    });

    it('should represent None (absence of value)', () => {
      const none: Option<number> = {
        kind: 'none',
      };

      expect(none.kind).toBe('none');
    });

    it('should be useful for nullable values', () => {
      function findUser(id: number): Option<{ id: number; name: string }> {
        if (id === 1) {
          return { kind: 'some', value: { id: 1, name: 'Alice' } };
        }
        return { kind: 'none' };
      }

      const user1 = findUser(1);
      const user2 = findUser(999);

      expect(user1.kind).toBe('some');
      expect(user2.kind).toBe('none');
    });
  });

  describe('InferZodSchema', () => {
    it('should infer type from Zod schema', () => {
      const UserSchema = z.object({
        id: z.string().uuid(),
        email: z.string().email(),
        age: z.number().int().min(0),
      });

      type User = InferZodSchema<typeof UserSchema>;

      const user: User = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        age: 25,
      };

      expect(user.email).toBe('test@example.com');
      expect(user.age).toBe(25);
    });
  });

  describe('Prettify', () => {
    it('should expand complex intersection types', () => {
      type Base = { a: number; b: string };
      type Extension = { c: boolean };
      type Combined = Base & Extension;
      type Pretty = Prettify<Combined>;

      const obj: Pretty = {
        a: 1,
        b: 'test',
        c: true,
      };

      expect(obj.a).toBe(1);
      expect(obj.b).toBe('test');
      expect(obj.c).toBe(true);
    });
  });

  describe('Type Inference with Generics', () => {
    it('should infer types through generic functions', () => {
      function identity<T>(value: T): T {
        return value;
      }

      const num = identity(42);
      const str = identity('hello');
      const obj = identity({ name: 'test' });

      expect(typeof num).toBe('number');
      expect(typeof str).toBe('string');
      expect(typeof obj).toBe('object');
    });

    it('should constrain types with generic constraints', () => {
      function getLength<T extends { length: number }>(value: T): number {
        return value.length;
      }

      expect(getLength('hello')).toBe(5);
      expect(getLength([1, 2, 3])).toBe(3);
      expect(getLength({ length: 10 })).toBe(10);
    });

    it('should work with multiple type parameters', () => {
      function pair<T, U>(first: T, second: U): [T, U] {
        return [first, second];
      }

      const result = pair(1, 'hello');

      expect(result[0]).toBe(1);
      expect(result[1]).toBe('hello');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Conditional Types', () => {
    it('should extract types conditionally', () => {
      type ExtractString<T> = T extends string ? T : never;

      type Test1 = ExtractString<string>; // string
      type Test2 = ExtractString<number>; // never

      const test1: ExtractString<string> = 'hello';
      expect(test1).toBe('hello');
    });

    it('should unwrap Promise types', () => {
      type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

      type Test1 = UnwrapPromise<Promise<number>>; // number
      type Test2 = UnwrapPromise<string>; // string

      const value1: UnwrapPromise<Promise<number>> = 42;
      const value2: UnwrapPromise<string> = 'hello';

      expect(value1).toBe(42);
      expect(value2).toBe('hello');
    });
  });
});
