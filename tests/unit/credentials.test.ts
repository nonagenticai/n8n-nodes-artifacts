/**
 * @file credentials.test.ts
 * Unit tests for ArtifactsApi credential class
 */
import { ArtifactsApi, ARTIFACTS_API_URL } from '../../credentials/ArtifactsApi.credentials';

describe('ArtifactsApi Credentials', () => {
  let cred: ArtifactsApi;

  beforeEach(() => {
    cred = new ArtifactsApi();
  });

  // ─── Metadata ──────────────────────────────────────────────

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(cred.name).toBe('artifactsApi');
    });

    it('should have correct displayName', () => {
      expect(cred.displayName).toBe('Artifacts API');
    });

    it('should have archive icon', () => {
      expect(cred.icon).toBe('fa:archive');
    });

    it('should have documentation URL', () => {
      expect(cred.documentationUrl).toBeDefined();
    });
  });

  // ─── Properties ──────────────────────────────────────────────

  describe('properties', () => {
    it('should define baseUrl, apiToken, and tenantId', () => {
      const names = cred.properties.map((p) => p.name);
      expect(names).toContain('baseUrl');
      expect(names).toContain('apiToken');
      expect(names).toContain('tenantId');
    });

    it('should mark apiToken as required', () => {
      const lt = cred.properties.find((p) => p.name === 'apiToken');
      expect(lt?.required).toBe(true);
    });

    it('should not require baseUrl', () => {
      const bu = cred.properties.find((p) => p.name === 'baseUrl');
      expect(bu?.required).toBe(false);
    });

    it('should default tenantId to "" (licence is then sent as X-Tenant-Id: Bearer …)', () => {
      const ti = cred.properties.find((p) => p.name === 'tenantId');
      expect(ti?.default).toBe('');
    });

    it('should make apiToken a password field', () => {
      const lt = cred.properties.find((p) => p.name === 'apiToken');
      expect(lt?.typeOptions?.password).toBe(true);
    });
  });

  // ─── ARTIFACTS_API_URL ──────────────────────────────────────
  //
  // Per the `feedback-no-hardcoded-urls-ports-in-code` policy, the default
  // export is an empty string — service addresses come from gitops env or
  // the credential's runtime baseUrl override, never a code-side fallback.

  describe('ARTIFACTS_API_URL', () => {
    it('falls back to empty string when env var unset', () => {
      expect(ARTIFACTS_API_URL).toBe('');
    });
  });

  // ─── authenticate() ──────────────────────────────────────────

  describe('authenticate()', () => {
    it('should add Authorization header with Bearer token', async () => {
      const credentials = { apiToken: 'my-token', tenantId: 'my-tenant' };
      const requestOptions: any = { url: 'http://test', headers: {} };

      const result = await cred.authenticate(credentials, requestOptions);

      expect(result.headers!['Authorization']).toBe('Bearer my-token');
    });

    it('should send the configured tenantId as X-Tenant-Id when present', async () => {
      const credentials = { apiToken: 'my-token', tenantId: 'my-tenant' };
      const requestOptions: any = { url: 'http://test', headers: {} };

      const result = await cred.authenticate(credentials, requestOptions);

      expect(result.headers!['X-Tenant-Id']).toBe('my-tenant');
      expect(result.headers!['X-Tenant-ID']).toBeUndefined();
    });

    it('should create headers object if not present', async () => {
      const credentials = { apiToken: 'my-token', tenantId: 'my-tenant' };
      const requestOptions: any = { url: 'http://test' };

      const result = await cred.authenticate(credentials, requestOptions);

      expect(result.headers).toBeDefined();
      expect(result.headers!['Authorization']).toBe('Bearer my-token');
    });

    it('should throw error when apiToken is missing', async () => {
      const credentials = { tenantId: 'my-tenant' };
      const requestOptions: any = { url: 'http://test', headers: {} };

      await expect(
        cred.authenticate(credentials, requestOptions),
      ).rejects.toThrow('API token is required');
    });

    // n8n-nodes-artifacts#36: artifact_service reads the licence ONLY from X-Tenant-Id and
    // answers 401 TENANT_REQUIRED without it, so an empty tenantId must still send the header.
    it.each([[undefined], ['']])(
      'should send X-Tenant-Id: Bearer <licence> when tenantId is %p',
      async (tenantId) => {
        const credentials: any = { apiToken: 'my-token', tenantId };
        const requestOptions: any = { url: 'http://test', headers: {} };

        const result = await cred.authenticate(credentials, requestOptions);

        expect(result.headers!['X-Tenant-Id']).toBe('Bearer my-token');
      },
    );
  });

  // ─── test (declarative) ─────────────────────────────────────
  // n8n (CredentialsTester, n8n@2.42.6) never CALLS a function-valued
  // ICredentialType.test — it routes `test.request`. So `test` must be a plain
  // ICredentialTestRequest whose host is the credential's own baseUrl.

  describe('test (declarative, against the credential baseUrl)', () => {
    const test = () => (cred as any).test;

    it('is a declarative request object, not a method n8n would never invoke', () => {
      expect(typeof test()).toBe('object');
      expect(test().request).toBeDefined();
    });

    it("targets the credential's baseUrl — no process env, no $env", () => {
      expect(test().request.baseURL).toBe('={{$credentials.baseUrl}}');
      expect(JSON.stringify(test().request)).not.toMatch(/\$env|ARTIFACTS_API_URL|https?:\/\//);
    });

    it('GETs an AUTHENTICATED route, not the public /health', () => {
      expect(test().request.method).toBe('GET');
      expect(test().request.url).not.toMatch(/health/);
      // The query rides in the URL (services.json credentialTestPath), so the
      // generator has ONE field to carry and no qs/url split to keep in sync.
      expect(test().request.url).toBe('/api/artifacts?limit=1');
    });

    it('carries the licence headers via authenticate()', async () => {
      const pinned = await cred.authenticate(
        { apiToken: 'tok', tenantId: '11111111-2222-3333-4444-555555555555' },
        { ...test().request, headers: {} },
      );
      expect(pinned.headers).toEqual({
        Authorization: 'Bearer tok',
        'X-Tenant-Id': '11111111-2222-3333-4444-555555555555',
      });

      const bare = await cred.authenticate({ apiToken: 'tok' }, { ...test().request, headers: {} });
      expect(bare.headers).toEqual({ Authorization: 'Bearer tok', 'X-Tenant-Id': 'Bearer tok' });
    });
  });
});
