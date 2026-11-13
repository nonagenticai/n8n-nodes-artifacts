/**
 * @file downloadArtifact.test.ts
 * Unit tests for the MANUAL downloadArtifact handler in operations/index.ts.
 *
 * downloadArtifact was an unimplemented TODO stub (calling it threw
 * "Unknown artifacts operation: downloadArtifact"). These tests drive the
 * current executeOperation() dispatch signature
 * `(ctx, baseUrl, headers, resource, operation, itemIndex)` and assert that
 * the handler:
 *   - hits GET {baseUrl}/projects/{projectId}/artifacts/{artifactId}/download
 *     with encoding:null + resolveWithFullResponse:true (binary),
 *   - forwards the shared license Bearer + X-Tenant-ID headers (no hardcoded tenant),
 *   - returns the bytes as base64 under `data` plus a json summary
 *     {artifactId, projectId, contentType, contentLength, filename, encoding},
 *   - parses the filename from content-disposition (default "download"),
 *   - errors when artifactId is missing.
 */
import { executeOperation } from '../../../nodes/Artifacts/operations/index';

// form-data is imported by operations/index.ts (for upload); stub it so the
// module loads without pulling the real dep into this handler's test.
jest.mock('form-data', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    getHeaders: jest.fn(() => ({})),
    getBuffer: jest.fn(() => Buffer.from('')),
  })),
}));

describe('downloadArtifact handler', () => {
  let mockCtx: any;
  const baseUrl = 'http://artifacts.test:8556';
  // The headers object execute() builds: Bearer + optional X-Tenant-ID.
  const headers = {
    Authorization: 'Bearer test-license-token',
    'X-Tenant-ID': '0195f48b-d000-7000-8000-000000000001',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCtx = {
      getInputData: jest.fn(() => [{ json: {} }]),
      getNodeParameter: jest.fn(),
      getNode: jest.fn(() => ({ name: 'Artifacts' })),
      helpers: {
        request: jest.fn(),
        httpRequest: jest.fn(),
        getBinaryDataBuffer: jest.fn(),
      },
    };
  });

  function setupParams(params: Record<string, any>): void {
    mockCtx.getNodeParameter.mockImplementation(
      (name: string, _index: number, defaultValue?: any) =>
        name in params ? params[name] : defaultValue,
    );
  }

  it('downloads bytes and returns base64 data + summary, hitting the correct URL/headers', async () => {
    setupParams({ projectId: 'proj-1', artifactId: 'art-1' });
    const fileBytes = Buffer.from('binary-pdf-\x00\x01\x02-data');
    mockCtx.helpers.request.mockResolvedValue({
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(fileBytes.length),
        'content-disposition': 'attachment; filename="report.pdf"',
      },
      body: fileBytes,
    });

    const result: any = await executeOperation(
      mockCtx,
      baseUrl,
      headers,
      'artifacts',
      'downloadArtifact',
      0,
    );

    // Correct request shape: binary GET with full response.
    expect(mockCtx.helpers.request).toHaveBeenCalledTimes(1);
    const reqOpts = mockCtx.helpers.request.mock.calls[0][0];
    expect(reqOpts).toMatchObject({
      method: 'GET',
      uri: `${baseUrl}/projects/proj-1/artifacts/art-1/download`,
      headers,
      encoding: null,
      resolveWithFullResponse: true,
    });
    // No hardcoded tenant — the shared credential headers are forwarded verbatim.
    expect(reqOpts.headers.Authorization).toBe('Bearer test-license-token');
    expect(reqOpts.headers['X-Tenant-ID']).toBe(
      '0195f48b-d000-7000-8000-000000000001',
    );

    // Summary + base64 bytes.
    expect(result).toMatchObject({
      artifactId: 'art-1',
      projectId: 'proj-1',
      contentType: 'application/pdf',
      contentLength: String(fileBytes.length),
      filename: 'report.pdf',
      encoding: 'base64',
    });
    // The bytes round-trip losslessly.
    expect(Buffer.from(result.data, 'base64').equals(fileBytes)).toBe(true);
  });

  it('forwards the shared execute() headers verbatim, incl. X-Tenant-Id: Bearer <licence> (#36)', async () => {
    setupParams({ projectId: 'proj-9', artifactId: 'art-9' });
    // execute() sets X-Tenant-Id to the tenant, or 'Bearer <licence>' when none is
    // configured — artifact_service reads the licence ONLY from X-Tenant-Id.
    const tenantlessHeaders = { Authorization: 'Bearer only-bearer', 'X-Tenant-Id': 'Bearer only-bearer' };
    mockCtx.helpers.request.mockResolvedValue({
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('x'),
    });

    await executeOperation(
      mockCtx,
      baseUrl,
      tenantlessHeaders,
      'artifacts',
      'downloadArtifact',
      0,
    );

    const reqOpts = mockCtx.helpers.request.mock.calls[0][0];
    expect(reqOpts.headers['X-Tenant-Id']).toBe('Bearer only-bearer');
  });

  it('defaults filename to "download" when content-disposition is absent', async () => {
    setupParams({ projectId: 'proj-2', artifactId: 'art-2' });
    mockCtx.helpers.request.mockResolvedValue({
      headers: { 'content-type': 'application/octet-stream', 'content-length': '3' },
      body: Buffer.from('abc'),
    });

    const result: any = await executeOperation(
      mockCtx,
      baseUrl,
      headers,
      'artifacts',
      'downloadArtifact',
      0,
    );

    expect(result.filename).toBe('download');
    expect(Buffer.from(result.data, 'base64').toString()).toBe('abc');
  });

  it('throws when artifactId is missing', async () => {
    setupParams({ projectId: 'proj-3' }); // no artifactId
    await expect(
      executeOperation(mockCtx, baseUrl, headers, 'artifacts', 'downloadArtifact', 0),
    ).rejects.toThrow('Artifact ID is required');
    expect(mockCtx.helpers.request).not.toHaveBeenCalled();
  });
});
