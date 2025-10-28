# Contributing to Graphile Worker Template

First off, thank you for considering contributing to the Graphile Worker Template! It's people like you that make this template better for everyone.

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please be respectful and constructive in all interactions.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** - Include code samples, configuration files, etc.
- **Describe the behavior you observed and what you expected**
- **Include logs and error messages**
- **Specify your environment**: OS, Bun version, PostgreSQL version, etc.

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the suggested enhancement
- **Explain why this enhancement would be useful** to most users
- **List any alternative solutions** you've considered

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Follow the code style** - We use ESLint and Prettier
3. **Write meaningful commit messages**
4. **Add tests** if applicable
5. **Update documentation** as needed
6. **Ensure the test suite passes** - `bun test`
7. **Make sure your code lints** - `bun run lint`

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/graphile-worker-template.git
cd graphile-worker-template

# Install dependencies
bun install

# Copy environment file
cp .env.example .env

# Start development environment
docker-compose up -d

# Run tests
bun test

# Run linter
bun run lint
```

## Code Style Guidelines

### TypeScript

- **Use TypeScript strict mode** - The project uses strict type checking
- **Leverage generics extensively** - This is a core feature of the template
- **Prefer type inference** over explicit types when obvious
- **Use Zod for runtime validation** - Never trust external input
- **Document complex types** - Add JSDoc comments for public APIs

Example:

```typescript
/**
 * Process items in batches with type safety
 *
 * @template TItem - Item type to process
 * @template TResult - Processing result type
 * @param items - Array of items
 * @param processor - Processing function
 * @returns Array of results
 */
async function processBatch<TItem, TResult>(
  items: TItem[],
  processor: (item: TItem) => Promise<TResult>
): Promise<TResult[]> {
  // Implementation
}
```

### Naming Conventions

- **Classes**: PascalCase - `EmailJob`, `JobRegistry`
- **Interfaces**: PascalCase with `I` prefix - `IJob`, `IRepository`
- **Types**: PascalCase - `JobContext`, `JobConfig`
- **Functions**: camelCase - `processJob`, `validatePayload`
- **Constants**: UPPER_SNAKE_CASE - `MAX_RETRIES`, `DEFAULT_TIMEOUT`
- **Files**: PascalCase for classes - `EmailJob.ts`, `JobRegistry.ts`

### Code Organization

- **One class per file** - Keeps files focused and maintainable
- **Group related functionality** - Use directories to organize by feature
- **Export from index files** - Provide clean public APIs
- **Keep functions small** - Single responsibility principle
- **Prefer composition over inheritance** - Unless inheritance adds clear value

### Documentation

- **Add JSDoc comments** to all public APIs
- **Include examples** in complex function documentation
- **Update README.md** if you add features
- **Add inline comments** for complex logic only

### Testing

- **Write unit tests** for business logic
- **Write integration tests** for database operations
- **Use descriptive test names** - `should retry job on transient error`
- **Follow AAA pattern** - Arrange, Act, Assert

Example:

```typescript
import { describe, it, expect } from 'bun:test';

describe('EmailJob', () => {
  it('should send email with valid payload', async () => {
    // Arrange
    const job = new EmailJob();
    const payload = {
      to: 'test@example.com',
      subject: 'Test',
      body: 'Test email',
    };

    // Act
    const result = await job.execute(payload, mockContext);

    // Assert
    expect(result).toBeDefined();
  });
});
```

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Performance improvement
- **test**: Adding or updating tests
- **chore**: Changes to build process, dependencies, etc.

### Examples

```
feat(jobs): add ScheduledJob base class for cron-style jobs

fix(worker): handle graceful shutdown properly on SIGTERM

docs(readme): add batch job example to quick start

refactor(types): simplify generic constraints in BaseJob

test(registry): add tests for job registration edge cases
```

## Pull Request Process

1. **Update the README.md** with details of changes if applicable
2. **Update the CHANGELOG.md** (if we have one) with your changes
3. **Ensure all tests pass** and code coverage doesn't decrease
4. **Request review** from maintainers
5. **Address feedback** promptly and professionally
6. **Squash commits** if requested before merging

## Project Structure

Understanding the project structure helps you contribute effectively:

```
src/
├── core/
│   ├── abstractions/  # Base classes - extend these for new patterns
│   ├── types/         # Type definitions - add new generic types here
│   ├── config/        # Configuration - add new config schemas here
│   └── instrumentation/ # Observability - extend metrics/tracing here
├── jobs/
│   ├── base/          # Specialized job classes
│   └── examples/      # Example implementations - add examples here
```

## Questions?

Feel free to open an issue with the `question` label if you need clarification on anything.

## Recognition

Contributors will be recognized in:
- The project README
- Release notes
- GitHub contributors page

Thank you for making this project better!
