/**
 * @fileoverview Utility helper types and advanced generic patterns
 * @module core/types/util
 */

import type { z } from 'zod';

import type { Constructor, AsyncFunction } from './common.types';

/**
 * Conditional type helpers
 */
export type If<TCondition extends boolean, TThen, TElse = never> = TCondition extends true
  ? TThen
  : TElse;

/**
 * Not type helper
 */
export type Not<T extends boolean> = T extends true ? false : true;

/**
 * And type helper
 */
export type And<T extends boolean, U extends boolean> = T extends true
  ? U extends true
    ? true
    : false
  : false;

/**
 * Or type helper
 */
export type Or<T extends boolean, U extends boolean> = T extends true
  ? true
  : U extends true
  ? true
  : false;

/**
 * String manipulation types
 */
export type Uppercase<T extends string> = Intrinsic.Uppercase<T>;
export type Lowercase<T extends string> = Intrinsic.Lowercase<T>;
export type Capitalize<T extends string> = Intrinsic.Capitalize<T>;
export type Uncapitalize<T extends string> = Intrinsic.Uncapitalize<T>;

/**
 * String template literal types
 */
export type Join<T extends string[], TDelimiter extends string = ''> = T extends [
  infer First extends string,
  ...infer Rest extends string[]
]
  ? Rest extends []
    ? First
    : `${First}${TDelimiter}${Join<Rest, TDelimiter>}`
  : '';

/**
 * Split string by delimiter
 */
export type Split<
  T extends string,
  TDelimiter extends string = ''
> = T extends `${infer First}${TDelimiter}${infer Rest}`
  ? [First, ...Split<Rest, TDelimiter>]
  : T extends ''
  ? []
  : [T];

/**
 * Trim string whitespace
 */
export type Trim<T extends string> = T extends ` ${infer Rest}`
  ? Trim<Rest>
  : T extends `${infer Rest} `
  ? Trim<Rest>
  : T;

/**
 * Replace string occurrences
 */
export type Replace<
  T extends string,
  TFrom extends string,
  TTo extends string
> = T extends `${infer Before}${TFrom}${infer After}`
  ? `${Before}${TTo}${Replace<After, TFrom, TTo>}`
  : T;

/**
 * Numeric type helpers
 */
export type IsPositive<T extends number> = `${T}` extends `-${string}` ? false : true;
export type IsNegative<T extends number> = Not<IsPositive<T>>;
export type IsZero<T extends number> = T extends 0 ? true : false;

/**
 * Array type helpers
 */
export type Head<T extends readonly unknown[]> = T extends [infer First, ...unknown[]]
  ? First
  : never;

export type Tail<T extends readonly unknown[]> = T extends [unknown, ...infer Rest]
  ? Rest
  : never;

export type Last<T extends readonly unknown[]> = T extends [...unknown[], infer L]
  ? L
  : never;

export type Init<T extends readonly unknown[]> = T extends [...infer I, unknown]
  ? I
  : never;

/**
 * Includes type - check if array includes type
 */
export type Includes<T extends readonly unknown[], U> = T extends [
  infer First,
  ...infer Rest
]
  ? First extends U
    ? true
    : Includes<Rest, U>
  : false;

/**
 * Length of tuple
 */
export type Length<T extends readonly unknown[]> = T['length'];

/**
 * Reverse tuple
 */
export type Reverse<T extends readonly unknown[]> = T extends [
  infer First,
  ...infer Rest
]
  ? [...Reverse<Rest>, First]
  : T;

/**
 * Concat tuples
 */
export type Concat<T extends readonly unknown[], U extends readonly unknown[]> = [
  ...T,
  ...U
];

/**
 * Flatten nested arrays
 */
export type FlattenArray<T extends readonly unknown[]> = T extends [
  infer First,
  ...infer Rest
]
  ? First extends readonly unknown[]
    ? [...FlattenArray<First>, ...FlattenArray<Rest>]
    : [First, ...FlattenArray<Rest>]
  : T;

/**
 * Object type helpers
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
export type ReadonlyBy<T, K extends keyof T> = Omit<T, K> & Readonly<Pick<T, K>>;
export type WritableBy<T, K extends keyof T> = Omit<T, K> & { -readonly [P in K]: T[P] };

/**
 * Deep pick - pick properties recursively
 */
export type DeepPick<T, K extends string> = K extends `${infer First}.${infer Rest}`
  ? First extends keyof T
    ? { [P in First]: DeepPick<T[First], Rest> }
    : never
  : K extends keyof T
  ? Pick<T, K>
  : never;

/**
 * Deep omit - omit properties recursively
 */
export type DeepOmit<T, K extends string> = K extends `${infer First}.${infer Rest}`
  ? First extends keyof T
    ? Omit<T, First> & { [P in First]: DeepOmit<T[First], Rest> }
    : T
  : Omit<T, K & keyof T>;

/**
 * Get property type by path
 */
export type GetProperty<T, K extends string> = K extends `${infer First}.${infer Rest}`
  ? First extends keyof T
    ? GetProperty<T[First], Rest>
    : never
  : K extends keyof T
  ? T[K]
  : never;

/**
 * Set property type by path
 */
export type SetProperty<T, K extends string, V> = K extends `${infer First}.${infer Rest}`
  ? First extends keyof T
    ? Omit<T, First> & { [P in First]: SetProperty<T[First], Rest, V> }
    : T
  : Omit<T, K & keyof T> & Record<K, V>;

/**
 * Paths type - get all possible paths in an object
 */
export type Paths<T, TPrefix extends string = ''> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${TPrefix}${K}` | Paths<T[K], `${TPrefix}${K}.`>
          : `${TPrefix}${K}`
        : never;
    }[keyof T]
  : never;

/**
 * Leaves type - get all leaf paths in an object
 */
export type Leaves<T, TPrefix extends string = ''> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? Leaves<T[K], `${TPrefix}${K}.`>
          : `${TPrefix}${K}`
        : never;
    }[keyof T]
  : never;

/**
 * Function type helpers
 */
export type Parameters<T extends (...args: unknown[]) => unknown> = T extends (
  ...args: infer P
) => unknown
  ? P
  : never;

export type ReturnType<T extends (...args: unknown[]) => unknown> = T extends (
  ...args: unknown[]
) => infer R
  ? R
  : never;

export type FirstParameter<T extends (...args: unknown[]) => unknown> = Parameters<T> extends [
  infer First,
  ...unknown[]
]
  ? First
  : never;

export type LastParameter<T extends (...args: unknown[]) => unknown> = Parameters<T> extends [
  ...unknown[],
  infer L
]
  ? L
  : never;

/**
 * Curried function type
 */
export type Curried<TArgs extends readonly unknown[], TReturn> = TArgs extends [
  infer First,
  ...infer Rest
]
  ? (arg: First) => Curried<Rest, TReturn>
  : TReturn;

/**
 * Debounced function type
 */
export type Debounced<TFunc extends AsyncFunction> = TFunc & {
  cancel: () => void;
  flush: () => void;
};

/**
 * Throttled function type
 */
export type Throttled<TFunc extends AsyncFunction> = TFunc & {
  cancel: () => void;
};

/**
 * Memoized function type
 */
export type Memoized<TFunc extends AsyncFunction> = TFunc & {
  cache: Map<string, unknown>;
  clear: () => void;
};

/**
 * Class member types
 */
export type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: unknown[]) => unknown ? K : never;
}[keyof T];

export type PropertyNames<T> = {
  [K in keyof T]: T[K] extends (...args: unknown[]) => unknown ? never : K;
}[keyof T];

export type MethodsOf<T> = Pick<T, MethodNames<T>>;
export type PropertiesOf<T> = Pick<T, PropertyNames<T>>;

/**
 * Instance type from constructor
 */
export type InstanceType<T extends Constructor> = T extends Constructor<infer I>
  ? I
  : never;

/**
 * Extract constructor parameters
 */
export type ConstructorParameters<T extends Constructor> = T extends Constructor<
  unknown,
  infer P
>
  ? P
  : never;

/**
 * Promise utilities
 */
export type PromiseValue<T> = T extends Promise<infer U> ? U : T;
export type PromisifyAll<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer R
    ? (...args: Args) => Promise<R>
    : T[K];
};

/**
 * Zod schema inference helpers
 */
export type InferInput<T extends z.ZodType> = z.input<T>;
export type InferOutput<T extends z.ZodType> = z.output<T>;

/**
 * Zod object shape type
 */
export type ZodObjectShape = Record<string, z.ZodType>;

/**
 * Create Zod schema from type
 */
export type SchemaFor<T> = z.ZodType<T>;

/**
 * Validator result type
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

/**
 * Validation error interface
 */
export interface ValidationError {
  path: string[];
  message: string;
  code: string;
}

/**
 * Builder pattern type
 */
export type Builder<T> = {
  [K in keyof T as `with${Capitalize<string & K>}`]: (value: T[K]) => Builder<T>;
} & {
  build(): T;
};

/**
 * Fluent interface type
 */
export type Fluent<T, TMethods extends keyof T = keyof T> = {
  [K in TMethods]: T[K] extends (...args: infer Args) => unknown
    ? (...args: Args) => Fluent<T, TMethods>
    : T[K];
};

/**
 * State machine type
 */
export type StateMachine<
  TState extends string,
  TEvent extends string,
  TContext = unknown
> = {
  state: TState;
  context: TContext;
  transition(event: TEvent): StateMachine<TState, TEvent, TContext>;
};

/**
 * Event emitter type map
 */
export type EventMap<TEvents extends Record<string, unknown>> = {
  [K in keyof TEvents]: TEvents[K];
};

/**
 * Type guard type
 */
export type TypeGuard<T> = (value: unknown) => value is T;

/**
 * Assertion function type
 */
export type AssertionFunction<T> = (value: unknown) => asserts value is T;

/**
 * Matcher type for pattern matching
 */
export type Matcher<T, TResult> = {
  [K in keyof T]: (value: T[K]) => TResult;
};

/**
 * Phantom type for compile-time checks
 */
export type Phantom<T, TTag extends string> = T & { readonly __phantom: TTag };

/**
 * Ensure all cases handled in switch (exhaustiveness check)
 */
export type Never = never;
export type AssertNever = (value: never) => never;

/**
 * Simplify complex intersection types
 */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Expand type recursively
 */
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

/**
 * Type equality check
 */
export type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y
  ? 1
  : 2
  ? true
  : false;

/**
 * Expect type to extend another
 */
export type Extends<T, U> = T extends U ? true : false;

/**
 * Require at least one property
 */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

/**
 * Require exactly one property
 */
export type RequireExactlyOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]: Required<Pick<T, K>> &
      Partial<Record<Exclude<Keys, K>, undefined>>;
  }[Keys];

/**
 * Nominal type using unique symbol
 */
declare const __nominal: unique symbol;
export type Nominal<T, TName extends string> = T & { [__nominal]: TName };

/**
 * Type-level arithmetic (for tuple lengths)
 */
export type Add<A extends number, B extends number> = [
  ...BuildTuple<A>,
  ...BuildTuple<B>
]['length'];

type BuildTuple<
  L extends number,
  T extends unknown[] = []
> = T['length'] extends L ? T : BuildTuple<L, [...T, unknown]>;

/**
 * Recursive type depth limit
 */
export type RecursionDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Intrinsic namespace for built-in string manipulation
 */
declare namespace Intrinsic {
  type Uppercase<S extends string> = string;
  type Lowercase<S extends string> = string;
  type Capitalize<S extends string> = string;
  type Uncapitalize<S extends string> = string;
}
