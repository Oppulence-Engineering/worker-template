/**
 * @fileoverview Core generic utility types for the Graphile Worker template
 * @module core/types/common
 */

import type { z } from 'zod';

/**
 * Generic constructor type for class instantiation
 * @template T - The type to construct
 * @template TArgs - Constructor argument types
 */
export type Constructor<T = object, TArgs extends readonly unknown[] = unknown[]> = new (
  ...args: TArgs
) => T;

/**
 * Abstract constructor type for abstract classes
 * @template T - The abstract type
 */
export type AbstractConstructor<T = object> = abstract new (...args: unknown[]) => T;

/**
 * Generic mixin type for composing multiple constructors
 * @template T - Array of constructor types
 */
export type Mixin<T extends readonly Constructor[]> = T extends readonly [
  Constructor<infer A>,
  ...infer Rest extends readonly Constructor[],
]
  ? Constructor<A & (Rest extends readonly Constructor[] ? InstanceType<Rest[number]> : object)>
  : Constructor<object>;

/**
 * Deep partial type - makes all properties optional recursively
 * @template T - The type to make partially optional
 */
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

/**
 * Deep readonly type - makes all properties readonly recursively
 * @template T - The type to make readonly
 */
export type DeepReadonly<T> = T extends object
  ? {
      readonly [P in keyof T]: DeepReadonly<T[P]>;
    }
  : T;

/**
 * Deep required type - makes all properties required recursively
 * @template T - The type to make required
 */
export type DeepRequired<T> = T extends object
  ? {
      [P in keyof T]-?: DeepRequired<T[P]>;
    }
  : T;

/**
 * Strict omit - omits properties in a type-safe manner
 * @template T - The source type
 * @template K - Keys to omit
 */
export type StrictOmit<T, K extends keyof T> = Omit<T, K>;

/**
 * Strict pick - picks properties in a type-safe manner
 * @template T - The source type
 * @template K - Keys to pick
 */
export type StrictPick<T, K extends keyof T> = Pick<T, K>;

/**
 * Mutable type - removes readonly modifiers
 * @template T - The type to make mutable
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Nullable type - makes a type nullable
 * @template T - The type to make nullable
 */
export type Nullable<T> = T | null;

/**
 * Maybe type - makes a type optional
 * @template T - The type to make optional
 */
export type Maybe<T> = T | undefined;

/**
 * NonNullableFields - makes all fields non-nullable
 * @template T - The object type
 */
export type NonNullableFields<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

/**
 * PromiseType - extracts the resolved type from a Promise
 * @template T - The promise type
 */
export type PromiseType<T> = T extends Promise<infer U> ? U : T;

/**
 * UnwrapPromise - unwraps nested promises
 * @template T - The potentially nested promise type
 */
export type UnwrapPromise<T> = T extends Promise<infer U> ? UnwrapPromise<U> : T;

/**
 * Async function type with generic parameters and return type
 * @template TArgs - Function argument types
 * @template TReturn - Return type (will be wrapped in Promise)
 */
export type AsyncFunction<TArgs extends readonly unknown[] = unknown[], TReturn = unknown> = (
  ...args: TArgs
) => Promise<TReturn>;

/**
 * Sync function type with generic parameters and return type
 * @template TArgs - Function argument types
 * @template TReturn - Return type
 */
export type SyncFunction<TArgs extends readonly unknown[] = unknown[], TReturn = unknown> = (
  ...args: TArgs
) => TReturn;

/**
 * Generic function type (sync or async)
 * @template TArgs - Function argument types
 * @template TReturn - Return type
 */
export type AnyFunction<TArgs extends readonly unknown[] = unknown[], TReturn = unknown> =
  | SyncFunction<TArgs, TReturn>
  | AsyncFunction<TArgs, TReturn>;

/**
 * Promisify - wraps return type in Promise if not already
 * @template T - The type to promisify
 */
export type Promisify<T> = T extends Promise<unknown> ? T : Promise<T>;

/**
 * ValueOf - gets the value type of an object
 * @template T - The object type
 */
export type ValueOf<T> = T[keyof T];

/**
 * KeysOfType - gets keys of a specific type from an object
 * @template T - The object type
 * @template V - The value type to filter by
 */
export type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/**
 * RequiredKeys - gets all required keys from a type
 * @template T - The object type
 */
export type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * OptionalKeys - gets all optional keys from a type
 * @template T - The object type
 */
export type OptionalKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? K : never;
}[keyof T];

/**
 * Exact - ensures exact type match (no extra properties)
 * @template T - The expected type
 * @template U - The actual type
 */
export type Exact<T, U extends T> = T & {
  [K in Exclude<keyof U, keyof T>]: never;
};

/**
 * Branded type for nominal typing
 * @template T - The base type
 * @template TBrand - The brand identifier
 */
export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

/**
 * Opaque type for stricter nominal typing
 * @template T - The base type
 * @template TToken - Unique token for the opaque type
 */
export type Opaque<T, TToken = unknown> = T & { readonly __opaque: TToken };

/**
 * Infer Zod schema type
 * @template T - The Zod schema
 */
export type InferZodSchema<T> = T extends z.ZodType<infer U> ? U : never;

/**
 * JSON primitive types
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON value type (recursive)
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * JSON object type
 */
export type JsonObject = { [key: string]: JsonValue };

/**
 * JSON array type
 */
export type JsonArray = JsonValue[];

/**
 * Serializable type constraint
 */
export type Serializable = JsonValue;

/**
 * Awaitable type - value or promise of value
 * @template T - The value type
 */
export type Awaitable<T> = T | Promise<T>;

/**
 * Result type for error handling (Either monad)
 * @template TData - Success data type
 * @template TError - Error type
 */
export type Result<TData, TError = Error> =
  | { success: true; data: TData }
  | { success: false; error: TError };

/**
 * Option type (Maybe monad)
 * @template T - The value type
 */
export type Option<T> = { kind: 'some'; value: T } | { kind: 'none' };

/**
 * Predicate function type
 * @template T - The input type
 */
export type Predicate<T> = (value: T) => boolean;

/**
 * Transformer function type
 * @template TInput - Input type
 * @template TOutput - Output type
 */
export type Transformer<TInput, TOutput> = (value: TInput) => TOutput;

/**
 * Validator function type
 * @template T - The type to validate
 */
export type ValidatorFn<T> = (value: unknown) => value is T;

/**
 * Merge two types (right takes precedence)
 * @template T - First type
 * @template U - Second type
 */
export type Merge<T, U> = Omit<T, keyof U> & U;

/**
 * Override type properties
 * @template T - Base type
 * @template U - Override type
 */
export type Override<T, U> = Omit<T, keyof U> & U;

/**
 * Tagged union type helper
 * @template TTag - Tag key
 * @template TUnion - Union of tagged types
 */
export type Tagged<TTag extends string, TUnion extends Record<TTag, string>> = TUnion;

/**
 * Extract tagged type from union
 * @template TUnion - Tagged union
 * @template TTag - Tag key
 * @template TValue - Tag value to extract
 */
export type ExtractTagged<
  TUnion extends Record<TTag, string>,
  TTag extends keyof TUnion,
  TValue extends TUnion[TTag],
> = Extract<TUnion, Record<TTag, TValue>>;

/**
 * Class decorator type
 * @template T - Class type
 */
export type ClassDecorator<T extends Constructor = Constructor> = (target: T) => T | void;

/**
 * Method decorator type
 */
export type MethodDecorator<T = unknown> = (
  target: object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<T>
) => TypedPropertyDescriptor<T> | void;

/**
 * Property decorator type
 */
export type PropertyDecorator = (target: object, propertyKey: string | symbol) => void;

/**
 * Parameter decorator type
 */
export type ParameterDecorator = (
  target: object,
  propertyKey: string | symbol,
  parameterIndex: number
) => void;

/**
 * Flatten nested types
 * @template T - Type to flatten
 */
export type Flatten<T> = T extends Array<infer U> ? U : T;

/**
 * Tuple to union type
 * @template T - Tuple type
 */
export type TupleToUnion<T extends readonly unknown[]> = T[number];

/**
 * Union to intersection type
 * @template U - Union type
 */
export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

/**
 * Type-safe entries type for objects
 * @template T - Object type
 */
export type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

/**
 * Pretty print type (expands type aliases for better IDE display)
 * @template T - Type to prettify
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
