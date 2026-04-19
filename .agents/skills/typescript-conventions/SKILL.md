---
name: typescript-conventions
description: TypeScript strict mode patterns, branded types, discriminated unions, and code style conventions used in Hybrid. Use when writing or reviewing TypeScript code, defining types, or enforcing code quality.
---

# TypeScript Conventions

Hybrid uses TypeScript 5.9+ with strict mode enabled. This skill covers patterns and conventions for writing type-safe code.

## Strict Mode Configuration

All packages use strict TypeScript configuration:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
```

### Key Implications

- **No `any`** — Use `unknown` for external/untrusted data
- **Array access may be undefined** — `arr[0]` returns `T | undefined`
- **Optional properties are exact** — `{ foo?: string }` doesn't accept `{ foo: undefined }`
- **Index signatures require bracket access** — `obj.key` invalid if `key` is from index signature

---

## NEVER Use `any`

```typescript
// ❌ NEVER
function parse(data: any) { return data.value }
const x: any = someValue
// @ts-ignore
// @ts-expect-error

// ✅ Use unknown for external data
function parse(data: unknown) {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid data")
  }
  if (!("value" in data)) {
    throw new Error("Missing value")
  }
  return data.value
}

// ✅ Use type guards
function isUser(data: unknown): data is User {
  return typeof data === "object" 
    && data !== null
    && "id" in data
    && "name" in data
}

// ✅ Use zod/valibot for validation
const UserSchema = z.object({
  id: z.string(),
  name: z.string()
})
type User = z.infer<typeof UserSchema>
```

---

## Branded Types

Use branded types for domain primitives that shouldn't be interchangeable:

```typescript
// packages/types/src/branded.ts
declare const brand: unique symbol

type Brand<T, B> = T & { [brand]: B }

type UserId = Brand<string, "UserId">
type ConversationId = Brand<string, "ConversationId">
type InboxId = Brand<string, "InboxId">
type MessageId = Brand<string, "MessageId">

// Creation
const userId = "alice" as UserId
const convId = "conv-123" as ConversationId

// Type-safe functions
function getUser(id: UserId): User { ... }
function getConversation(id: ConversationId): Conversation { ... }

// ❌ Compile error
getUser(convId) // Type 'ConversationId' is not assignable to type 'UserId'
```

### When to Brand

- **IDs** — `UserId`, `ConversationId`, `MessageId`, `InboxId`
- **Hex strings** — `Address`, `Hex`, `Signature`
- **Timestamps** — `UnixTimestamp`, `ISODateString`
- **Hashes** — `Hash`, `CID`

### When NOT to Brand

- Regular strings that don't represent domain concepts
- Numbers used as counters or indices
- Generic configuration values

---

## Discriminated Unions

Use discriminated unions for variant types:

```typescript
// ✅ Discriminated union with 'kind' field
type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string; staggerMs?: number }

// TypeScript narrows automatically
function getNextRun(schedule: CronSchedule): Date {
  switch (schedule.kind) {
    case "at":
      return new Date(schedule.at)
    case "every":
      return new Date(Date.now() + schedule.everyMs)
    case "cron":
      return parseCron(schedule.expr)
  }
}

// ❌ Avoid type assertions
type Schedule = 
  | { type: "once"; time: string }
  | { type: "recurring"; interval: number }
  
function getNextRun(schedule: Schedule): Date {
  if (schedule.type === "once") {
    // TypeScript knows schedule.time exists
    return new Date(schedule.time)
  }
  // TypeScript knows schedule.interval exists
  return new Date(Date.now() + schedule.interval)
}
```

### Exhaustive Checking

```typescript
function getStatusText(status: ScheduleStatus): string {
  switch (status) {
    case "pending": return "Pending"
    case "running": return "Running"
    case "completed": return "Completed"
    case "failed": return "Failed"
    default:
      // Compile error if a case is missed
      const _exhaustive: never = status
      return _exhaustive
  }
}
```

---

## Type Guards & Assertions

```typescript
// Type guard function
function isCronSchedule(value: unknown): value is CronSchedule {
  if (typeof value !== "object" || value === null) return false
  if (!("kind" in value)) return false
  const kind = (value as { kind: unknown }).kind
  return kind === "at" || kind === "every" || kind === "cron"
}

// Assertion function
function assertIsUser(value: unknown): asserts value is User {
  if (!isUser(value)) {
    throw new TypeError("Expected User")
  }
}

// Use
const data: unknown = JSON.parse(input)
if (isCronSchedule(data)) {
  // data is CronSchedule here
}

assertIsUser(data)
// data is User hereafter
```

---

## Generic Constraints

```typescript
// ✅ Constrain generics meaningfully
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key]
}

// ✅ Use inferred types where possible
function createMap<T extends PropertyKey, U>(entries: [T, U][]): Record<T, U> {
  return Object.fromEntries(entries) as Record<T, U>
}

// ✅ Conditional types for variant returns
type ApiResponse<T> = T extends { error: string } 
  ? { success: false; error: string }
  : { success: true; data: T }

// ✅ Mapped types
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
```

---

## Error Handling

```typescript
// ✅ Typed error handling
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E }

async function tryAsync<T>(
  fn: () => Promise<T>
): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) }
  }
}

// Usage
const result = await tryAsync(() => fetchUser(id))
if (result.ok) {
  console.log(result.value)
} else {
  console.error(result.error)
}

// ✅ Custom error classes
class ValidationError extends Error {
  constructor(message: string, public field: string) {
    super(message)
    this.name = "ValidationError"
  }
}

// ✅ Catch specific errors
try {
  await processJob(job)
} catch (e) {
  if (e instanceof ValidationError) {
    // Handle validation error
  } else if (e instanceof NetworkError) {
    // Handle network error
  } else {
    throw e // Re-throw unknown errors
  }
}
```

---

## Interface vs Type

```typescript
// ✅ Use interface for object shapes (can be extended)
interface User {
  id: string
  name: string
  email: string
}

interface UserWithTimestamps extends User {
  createdAt: Date
  updatedAt: Date
}

// ✅ Use type for unions, intersections, mapped types
type Status = "pending" | "running" | "completed"
type UserWithRole = User & { role: Role }
type PartialUser = Partial<User>
type UserKeys = keyof User
```

---

## Async Patterns

```typescript
// ✅ Always handle promise rejections
async function fetchUser(id: string): Promise<User | null> {
  try {
    const response = await fetch(`/api/users/${id}`)
    if (!response.ok) return null
    return response.json()
  } catch (e) {
    console.error("Failed to fetch user:", e)
    return null
  }
}

// ✅ Use Promise.all for parallel operations
const [users, conversations] = await Promise.all([
  fetchUsers(),
  fetchConversations()
])

// ✅ Use Promise.allSettled when some may fail
const results = await Promise.allSettled([
  fetchUser(id1),
  fetchUser(id2),
  fetchUser(id3)
])
const succeeded = results
  .filter((r): r is PromiseFulfilledResult<User> => r.status === "fulfilled")
  .map(r => r.value)

// ✅ Proper typing of async functions
type AsyncFunction<T, Args extends unknown[]> = (...args: Args) => Promise<T>
```

---

## Null/Undefined Handling

```typescript
// ✅ Use optional chaining
const name = user?.profile?.name

// ✅ Use nullish coalescing for defaults
const timeout = options.timeout ?? 5000

// ✅ Use ??= for mutable defaults
function init(config?: Config) {
  config ??= defaultConfig
  return config
}

// ✅ Type narrowing
function process(value: string | null | undefined): string {
  if (value == null) return "default" // Catches null and undefined
  return value.toUpperCase()
}

// ✅ Explicit undefined for optional returns
function findUser(id: string): User | undefined {
  return users.get(id) // Returns undefined if not found
}
```

---

## Array Safety

```typescript
// ❌ Unsafe with noUncheckedIndexedAccess
const first = arr[0] // Type: T | undefined

// ✅ Safe access patterns
const first = arr[0]
if (first !== undefined) {
  // first is T here
}

// ✅ Or use at() with explicit undefined handling
const first = arr.at(0)
return first ?? defaultValue

// ✅ Filtering undefined
const defined = arr.filter((x): x is T => x !== undefined)

// ✅ Safe array methods
const ids = users.map(u => u.id) // string[]
const first = ids[0] // string | undefined
const name = users.find(u => u.id === id)?.name // string | undefined
```

---

## Object Types

```typescript
// ✅ Use satisfies for validation
const config = {
  port: 8454,
  host: "localhost"
} satisfies Record<string, string | number>

// ✅ Use as const for literal types
const STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed"
} as const

type Status = typeof STATUS[keyof typeof STATUS]

// ✅ Record for dynamic keys
type UserMap = Record<UserId, User>
type StringMap = Record<string, string>

// ✅ Partial and Required
function updateUser(user: User, updates: Partial<User>): User {
  return { ...user, ...updates }
}
```

---

## Function Types

```typescript
// ✅ Explicit return types for public functions
function parseConfig(input: string): Config {
  // ...
}

// ✅ Infer for internal/private functions
const double = (x: number) => x * 2

// ✅ Function overloads for different call patterns
function parse(input: string): Config
function parse(input: string, strict: true): Config
function parse(input: string, strict: false): Partial<Config>
function parse(input: string, strict = true) {
  // Implementation
}

// ✅ Generic functions
function identity<T>(value: T): T {
  return value
}
```

---

## Import Patterns

```typescript
// ✅ Named imports
import { User, Conversation } from "@hybrd/types"

// ✅ Type-only imports
import type { CronSchedule, CronJob } from "@hybrd/types"

// ✅ Namespace imports for modules with many exports
import * as fs from "node:fs/promises"

// ✅ Default imports
import { z } from "zod"

// ✅ Side-effect imports (rare)
import "./setup"
```

---

## Module Patterns

```typescript
// ✅ Re-export for public API
export { User, Conversation } from "./user"
export type { UserId, ConversationId } from "./branded"
export { isUser } from "./guards"

// ✅ Namespace re-exports
export * as API from "./api"

// ✅ Barrel file (index.ts)
export { User } from "./user"
export { Conversation } from "./conversation"
export type { UserId } from "./branded"
```

---

## Zod Integration

```typescript
import { z } from "zod"

// ✅ Define schemas
const UserSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["owner", "guest"]).default("guest"),
  metadata: z.record(z.unknown()).optional()
})

// ✅ Infer types from schemas
type User = z.infer<typeof UserSchema>
type UserInput = z.input<typeof UserSchema>
type UserOutput = z.output<typeof UserSchema>

// ✅ Parse and validate
const user = UserSchema.parse(data) // throws on invalid
const result = UserSchema.safeParse(data) // returns { success, data/error }

// ✅ Transform
const TrimmedUserSchema = UserSchema.transform(user => ({
  ...user,
  name: user.name.trim()
}))

// ✅ Refine
const ScheduleSchema = z.object({
  kind: z.enum(["at", "every", "cron"]),
  at: z.string().datetime().optional(),
  everyMs: z.number().positive().optional(),
  expr: z.string().optional()
}).refine(
  (data) => {
    if (data.kind === "at") return !!data.at
    if (data.kind === "every") return !!data.everyMs
    if (data.kind === "cron") return !!data.expr
    return false
  },
  { message: "Invalid schedule configuration" }
)
```

---

## Testing Patterns

```typescript
// ✅ Type tests
import { describe, it, expectType } from "vitest"

describe("types", () => {
  it("UserId is branded string", () => {
    type Test = UserId extends string ? true : false
    expectType<Test>(true)
  })
})

// ✅ Mock types
type MockConversation = {
  id: ConversationId
  messages: MockMessage[]
  send: (content: string) => Promise<void>
}

function createMockConversation(overrides?: Partial<MockConversation>): MockConversation {
  return {
    id: "conv-123" as ConversationId,
    messages: [],
    send: async () => {},
    ...overrides
  }
}
```

---

## Common Pitfalls

### 1. Forgetting `undefined` in Array Access

```typescript
// ❌ Runtime error
const first = arr[0].toUpperCase()

// ✅ Handle undefined
const first = arr[0]
if (first) {
  first.toUpperCase()
}
```

### 2. Object Property Access

```typescript
// ❌ May be undefined
const value = obj[key]

// ✅ Handle undefined
const value = obj[key] ?? defaultValue
```

### 3. JSON.parse Returns unknown

```typescript
// ❌ Unsafe
const data = JSON.parse(input) as User[]

// ✅ Validate
const data = UserSchema.array().parse(JSON.parse(input))
```

### 4. Optional Property vs Undefined Value

```typescript
interface Config {
  timeout?: number // Can be omitted
  retries?: number | undefined // Can be omitted or undefined
}

const config1: Config = {} // ✅
const config2: Config = { timeout: undefined } // ❌ with exactOptionalPropertyTypes
const config3: Config = { timeout: 5000 } // ✅
```

---

## Biome Lint Rules

Run `pnpm lint` to check. Key rules:

- `noUnusedVariables`
- `noImplicitAny`
- `useConst`
- `noNonNullAssertion`
- `noUnsafeDeclarationMerging`
- `useExplicitType`

Fix with `pnpm lint:fix` for auto-fixable issues.