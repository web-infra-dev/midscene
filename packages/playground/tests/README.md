# @midscene/playground Tests

This directory contains the test suite for the `@midscene/playground` package.

## Test Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── common.test.ts          # Tests for common utilities
│   ├── playground-sdk.test.ts  # Tests for PlaygroundSDK
│   ├── base-adapter.test.ts    # Tests for BasePlaygroundAdapter
│   ├── local-execution-adapter.test.ts   # Tests for LocalExecutionAdapter
│   ├── remote-execution-adapter.test.ts  # Tests for RemoteExecutionAdapter
│   └── types.test.ts           # Type definition tests
├── integration/             # Integration tests
│   └── playground-integration.test.ts    # End-to-end workflow tests
├── setup.ts                # Test setup and global mocks
└── README.md               # This file
```

## Running Tests

### All Tests
```bash
pnpm test
```

### Watch Mode
```bash
pnpm test:watch
```

### Coverage Report
```bash
pnpm test -- --coverage
```

### Specific Test Files
```bash
# Run only unit tests
pnpm test tests/unit

# Run only integration tests
pnpm test tests/integration

# Run specific test file
pnpm test tests/unit/common.test.ts
```

## Test Categories

### Unit Tests

**common.test.ts**
- Tests core utility functions like `formatErrorMessage`, `validateStructuredParams`, and `executeAction`
- Validates API constants and their relationships
- Tests error handling and parameter validation

**playground-sdk.test.ts**
- Tests the main PlaygroundSDK class
- Validates adapter selection logic
- Tests delegation to appropriate adapters
- Mocks underlying adapters for isolation

**base-adapter.test.ts**
- Tests the abstract BasePlaygroundAdapter class
- Validates common validation logic
- Tests parameter filtering and display content creation
- Tests helper methods and error handling

**local-execution-adapter.test.ts**
- Tests LocalExecutionAdapter specific functionality
- Validates local agent interaction
- Tests progress tracking and task cancellation
- Tests parameter parsing for local execution

**remote-execution-adapter.test.ts**
- Tests RemoteExecutionAdapter specific functionality
- Validates server communication methods
- Tests Android-specific error formatting
- Mocks fetch calls for server interactions

**types.test.ts**
- Validates TypeScript type definitions
- Ensures interfaces accept valid objects
- Tests type compatibility and extensibility

### Integration Tests

**playground-integration.test.ts**
- End-to-end workflow testing
- Tests complete scenarios from SDK creation to action execution
- Validates cross-adapter compatibility
- Tests real-world usage patterns

## Test Setup

The `setup.ts` file provides:
- Global mock configuration
- Console method mocking to reduce test noise
- Browser global mocking for server-side tests
- Automatic cleanup between tests

## Mocking Strategy

- **External Dependencies**: Mocked using Vitest's `vi.mock()`
- **Network Calls**: Mocked using global `fetch` mock
- **Console Output**: Suppressed during tests to reduce noise
- **Browser APIs**: Mocked for Node.js environment compatibility

## Coverage

The test suite aims for high coverage of:
- All exported functions and classes
- Error handling paths
- Edge cases and boundary conditions
- Type safety and interface compliance

Coverage reports are generated in `coverage/` directory when running with `--coverage` flag.

## Writing New Tests

When adding new functionality:

1. **Unit Tests**: Add tests in the appropriate `tests/unit/*.test.ts` file
2. **Integration Tests**: Add end-to-end scenarios to `playground-integration.test.ts`
3. **Type Tests**: Add type validation to `types.test.ts` for new interfaces
4. **Mocking**: Use existing mock patterns and add new mocks as needed

### Test Naming Convention

- Describe blocks: Use present tense describing the component
- Test cases: Use "should" statements describing expected behavior
- Mock functions: Prefix with "mock" for clarity

### Example Test Structure

```typescript
describe('ComponentName', () => {
  let component: ComponentType;

  beforeEach(() => {
    component = new ComponentType();
  });

  describe('methodName', () => {
    it('should handle normal case', () => {
      // Test implementation
    });

    it('should handle error case', () => {
      // Error test implementation
    });
  });
});
```