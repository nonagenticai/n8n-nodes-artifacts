/**
 * Jest test setup file
 *
 * Runs before all tests to configure the test environment
 */
import { jest } from '@jest/globals';

// Global test timeout
jest.setTimeout(10000);

// Mock localStorage to avoid security errors in Node environment
if (typeof localStorage === 'undefined') {
  global.localStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn(),
  } as any;
}

// Suppress console warnings during tests (optional)
if (process.env.NODE_ENV === 'test') {
  global.console = {
    ...console,
    warn: jest.fn(),
    error: jest.fn(),
  };
}
