/**
 * @file license-authenticator.test.ts
 * @jest-environment node
 *
 * Unit tests for RetryingRequest retry behaviour.
 *
 * Specifically guards the connection-layer retry that absorbs transient
 * istio-ambient stuck-tunnel RSTs (`read ECONNRESET` etc.). Without this
 * guard a single TCP reset propagates as a permanent `action: failed`
 * for callers like the Store Artifact n8n pattern.
 */
import { jest } from '@jest/globals';
import { RetryingRequest, isTransientNetworkError } from '../../helpers/requestExecution';

// Minimal stand-in for IExecuteFunctions: only getNode() is touched
// by NodeApiError construction inside the auth retry loop. Tests in
// this file never reach the auth-failure path so this is sufficient.
const ctxStub = { getNode: () => ({ name: 'Test', type: 'test', typeVersion: 1 }) } as any;

describe('RetryingRequest.executeWithRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries on ECONNRESET and resolves on a later attempt', async () => {
    const auth = new RetryingRequest();
    let calls = 0;
    const requestFn = jest.fn(async () => {
      calls += 1;
      if (calls <= 2) {
        const err: any = new Error('read ECONNRESET');
        err.code = 'ECONNRESET';
        throw err;
      }
      return { ok: true, calls };
    });

    const promise = auth.executeWithRetry(requestFn as any, ctxStub, { method: 'GET' });
    // Two retries scheduled at 1s and 2s respectively (delays[0] + delays[1]).
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);
    const result = await promise;
    expect(result).toEqual({ ok: true, calls: 3 });
    expect(requestFn).toHaveBeenCalledTimes(3);
  });

  it('retries on socket-hang-up messages with no error code', async () => {
    const auth = new RetryingRequest();
    let calls = 0;
    const requestFn = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('socket hang up');
      }
      return { ok: true };
    });

    const promise = auth.executeWithRetry(requestFn as any, ctxStub, { method: 'GET' });
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(requestFn).toHaveBeenCalledTimes(2);
  });

  it('throws the last connection error after MAX_RETRIES attempts', async () => {
    const auth = new RetryingRequest();
    const requestFn = jest.fn(async () => {
      const err: any = new Error('read ECONNRESET');
      err.code = 'ECONNRESET';
      throw err;
    });

    const promise = auth.executeWithRetry(requestFn as any, ctxStub, { method: 'GET' }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(1000 + 2000 + 8000);
    const result = (await promise) as Error;
    expect(result).toBeInstanceOf(Error);
    expect((result as any).code).toBe('ECONNRESET');
    expect(requestFn).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 401 — wraps in NodeApiError immediately', async () => {
    const auth = new RetryingRequest();
    const requestFn = jest.fn(async () => {
      const err: any = new Error('Unauthorized');
      err.statusCode = 401;
      throw err;
    });

    await expect(auth.executeWithRetry(requestFn as any, ctxStub)).rejects.toThrow(
      /API token invalid or expired/,
    );
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx for an IDEMPOTENT method and resolves on a later attempt', async () => {
    const auth = new RetryingRequest();
    let calls = 0;
    const requestFn = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        const err: any = new Error('upstream blew up');
        err.statusCode = 503;
        throw err;
      }
      return { ok: true };
    });

    const promise = auth.executeWithRetry(requestFn as any, ctxStub, { method: 'GET' });
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(requestFn).toHaveBeenCalledTimes(2);
  });

  // An HTTP status means the server RESPONDED, so the request was delivered and
  // processed to some degree. Retrying a POST on that risks applying the write
  // twice — a 504 in particular means the gateway stopped waiting for an
  // upstream that may well have committed it.
  it('does NOT retry a 5xx for a non-idempotent method', async () => {
    const auth = new RetryingRequest();
    const requestFn = jest.fn(async () => {
      const err: any = new Error('upstream blew up');
      err.statusCode = 504;
      throw err;
    });

    await expect(
      auth.executeWithRetry(requestFn as any, ctxStub, { method: 'POST' }),
    ).rejects.toThrow(/upstream blew up/);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  // Fail safe: a caller that does not declare its method is treated as
  // non-idempotent, because the cost of a wrong guess is a duplicated write.
  it('does NOT retry a 5xx when no method is supplied (fail safe)', async () => {
    const auth = new RetryingRequest();
    const requestFn = jest.fn(async () => {
      const err: any = new Error('upstream blew up');
      err.statusCode = 503;
      throw err;
    });

    await expect(auth.executeWithRetry(requestFn as any, ctxStub)).rejects.toThrow(
      /upstream blew up/,
    );
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  // A reset / hang-up can fire AFTER the request was delivered, so re-sending a
  // POST double-applies it (n8n-nodes-coding #36). A POST is sent exactly once;
  // only a pre-send failure (ECONNREFUSED, DNS) is retried for it.
  it('does NOT re-send a POST after a transport error', async () => {
    const auth = new RetryingRequest();
    const err: any = new Error('read ECONNRESET');
    err.code = 'ECONNRESET';
    const requestFn = jest.fn(async () => {
      throw err;
    });

    await expect(auth.executeWithRetry(requestFn as any, ctxStub, { method: 'POST' })).rejects.toBe(err);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on a 422 (validation error)', async () => {
    const auth = new RetryingRequest();
    const requestFn = jest.fn(async () => {
      const err: any = new Error('Unprocessable');
      err.statusCode = 422;
      throw err;
    });

    await expect(auth.executeWithRetry(requestFn as any, ctxStub)).rejects.toThrow(/Unprocessable/);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });
});

describe('isTransientNetworkError', () => {
  it.each([
    ['ECONNRESET via code', { code: 'ECONNRESET' }],
    ['EPIPE via code', { code: 'EPIPE' }],
    ['ECONNREFUSED via code', { code: 'ECONNREFUSED' }],
    ['ETIMEDOUT via code', { code: 'ETIMEDOUT' }],
    ['EAI_AGAIN via code', { code: 'EAI_AGAIN' }],
    ['ECONNRESET via cause.code', { cause: { code: 'ECONNRESET' } }],
    ['socket hang up via message', { message: 'socket hang up' }],
    ['connection reset via message', { message: 'connection reset by peer' }],
    ['Connection aborted via message', { message: 'Connection aborted.' }],
  ])('classifies %s as transient', (_label, err) => {
    expect(isTransientNetworkError(err)).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['primitive', 'just a string'],
    ['unrelated code', { code: 'EACCES' }],
    ['unrelated message', { message: 'token expired' }],
    ['no code or message', {}],
  ])('does not classify %s as transient', (_label, err) => {
    expect(isTransientNetworkError(err)).toBe(false);
  });
});
