import { describe, it, expect } from '@jest/globals';
import { executeOperation } from '../../nodes/Artifacts/operations';
import { artifactsFields, artifactsOperations } from '../../nodes/Artifacts/resources/artifacts.resource';

/**
 * DOC-1 (artifact_service #59): document metadata on upload, PATCH /metadata,
 * list filters, and the render route. Every request is captured by a fake
 * ctx.helpers; nothing leaves the process.
 */

const BASE = 'http://artifacts.test';
const HEADERS = { Authorization: 'Bearer lic', 'X-Tenant-Id': 'Bearer lic' };
const P = '11111111-1111-1111-1111-111111111111';
const A = '22222222-2222-2222-2222-222222222222';

type Call = { kind: 'request' | 'httpRequest'; opts: any };

function makeCtx(params: Record<string, unknown>, response: unknown = {}) {
	const calls: Call[] = [];
	const get = (name: string, fallback: unknown) => {
		if (name.startsWith('additionalOptions.')) {
			const ao = (params.additionalOptions ?? {}) as Record<string, unknown>;
			const k = name.slice('additionalOptions.'.length);
			return k in ao ? ao[k] : fallback;
		}
		return name in params ? params[name] : fallback;
	};
	const ctx: any = {
		getNode: () => ({ name: 'Artifacts' }),
		getInputData: () => [{ json: {}, binary: { data: { fileName: 'r.md', mimeType: 'text/markdown', data: '' } } }],
		getNodeParameter: (name: string, _i: number, fallback?: unknown) => get(name, fallback),
		continueOnFail: () => false,
		helpers: {
			request: async (opts: any) => {
				calls.push({ kind: 'request', opts });
				return response;
			},
			httpRequest: async (opts: any) => {
				calls.push({ kind: 'httpRequest', opts });
				return response;
			},
			getBinaryDataBuffer: async () => Buffer.from('# hello\n'),
		},
	};
	return { ctx, calls };
}

/** Multipart part names in a form-data buffer, in order. */
function formFieldNames(body: Buffer): string[] {
	return [...body.toString('utf8').matchAll(/form-data; name="([^"]+)"/g)].map((m) => m[1]);
}

function formFieldValue(body: Buffer, field: string): string | undefined {
	const m = body.toString('utf8').match(new RegExp(`name="${field}"\\r\\n\\r\\n([^\\r]*)\\r\\n`));
	return m ? m[1] : undefined;
}

/** The parameters an n8n node fills in from declared defaults for one operation. */
function declaredDefaults(operation: string): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const f of artifactsFields) {
		const ops = (f.displayOptions?.show?.operation ?? []) as string[];
		if (ops.includes(operation)) out[f.name] = f.default;
	}
	return out;
}

describe('upload: document metadata fields', () => {
	it('sends none of the new fields when they are left at their defaults (pre-DOC-1 form)', async () => {
		const { ctx, calls } = makeCtx({ ...declaredDefaults('uploadArtifact'), projectId: P, kind: 'doc' });
		await executeOperation(ctx, BASE, HEADERS, 'artifacts', 'uploadArtifact', 0);
		expect(calls).toHaveLength(1);
		// Exactly the parts the node sent before DOC-1 for the same inputs.
		expect(formFieldNames(calls[0].opts.body)).toEqual(['file', 'kind', 'origin_kind']);
		expect(calls[0].opts.url).toBe(`${BASE}/projects/${P}/artifacts/upload`);
	});

	it('sends each field that is set, under the service form name', async () => {
		const { ctx, calls } = makeCtx({
			...declaredDefaults('uploadArtifact'),
			projectId: P,
			kind: 'doc',
			title: 'Analysis report',
			docType: 'analysis_report',
			phase: 'preliminary',
			summary: 'What we found',
			plankaCardId: '1234567890123456789',
		});
		await executeOperation(ctx, BASE, HEADERS, 'artifacts', 'uploadArtifact', 0);
		const body: Buffer = calls[0].opts.body;
		expect(formFieldValue(body, 'title')).toBe('Analysis report');
		expect(formFieldValue(body, 'doc_type')).toBe('analysis_report');
		expect(formFieldValue(body, 'phase')).toBe('preliminary');
		expect(formFieldValue(body, 'summary')).toBe('What we found');
		expect(formFieldValue(body, 'planka_card_id')).toBe('1234567890123456789');
	});

	it('sends only the one field that is set', async () => {
		const { ctx, calls } = makeCtx({ ...declaredDefaults('uploadArtifact'), projectId: P, phase: 'execution' });
		await executeOperation(ctx, BASE, HEADERS, 'artifacts', 'uploadArtifact', 0);
		const names = formFieldNames(calls[0].opts.body);
		expect(names).toContain('phase');
		for (const absent of ['title', 'doc_type', 'summary', 'planka_card_id']) expect(names).not.toContain(absent);
	});
});

describe('updateArtifactMetadata (PATCH /metadata)', () => {
	it('PATCHes only the fields that are set', async () => {
		const { ctx, calls } = makeCtx({
			...declaredDefaults('updateArtifactMetadata'),
			projectId: P,
			artifactId: A,
			title: 'New title',
			plankaCardId: '987',
		});
		await executeOperation(ctx, BASE, HEADERS, 'artifacts', 'updateArtifactMetadata', 0);
		expect(calls).toHaveLength(1);
		expect(calls[0].opts.method).toBe('PATCH');
		expect(calls[0].opts.uri).toBe(`${BASE}/projects/${P}/artifacts/${A}/metadata`);
		expect(calls[0].opts.body).toEqual({ title: 'New title', planka_card_id: '987' });
	});

	it('refuses an empty artifact id before any request', async () => {
		const { ctx, calls } = makeCtx({ ...declaredDefaults('updateArtifactMetadata'), projectId: P, artifactId: '' });
		await expect(executeOperation(ctx, BASE, HEADERS, 'artifacts', 'updateArtifactMetadata', 0)).rejects.toThrow(/artifactId/);
		expect(calls).toHaveLength(0);
	});
});

describe('list filters', () => {
	it.each([
		['listArtifacts', `${BASE}/projects/${P}/artifacts`],
		['artifactsListCrossProject', `${BASE}/api/artifacts`],
	])('%s forwards phase / doc_type / planka_card_id', async (op, path) => {
		const { ctx, calls } = makeCtx({
			projectId: P,
			additionalOptions: { phase: 'execution', docType: 'analysis_report', plankaCardId: '42' },
		});
		await executeOperation(ctx, BASE, HEADERS, 'artifacts', op, 0);
		const url = new URL(calls[0].opts.uri);
		expect(`${url.origin}${url.pathname}`).toBe(path);
		expect(url.searchParams.get('phase')).toBe('execution');
		expect(url.searchParams.get('doc_type')).toBe('analysis_report');
		expect(url.searchParams.get('planka_card_id')).toBe('42');
	});

	it('sends no new filter when none is set (unchanged query)', async () => {
		const { ctx, calls } = makeCtx({ projectId: P, additionalOptions: { kind: 'doc' } });
		await executeOperation(ctx, BASE, HEADERS, 'artifacts', 'listArtifacts', 0);
		expect(calls[0].opts.uri).toBe(`${BASE}/projects/${P}/artifacts?kind=doc`);
	});
});

describe('render', () => {
	const html = { headers: { 'content-type': 'text/html; charset=utf-8', 'x-render-cache': 'miss' }, body: Buffer.from('<h1>x</h1>') };

	it('renderArtifact defaults to html and returns base64 bytes like download', async () => {
		const { ctx, calls } = makeCtx({ projectId: P, artifactId: A }, html);
		const out: any = await executeOperation(ctx, BASE, HEADERS, 'artifacts', 'renderArtifact', 0);
		expect(calls[0].opts.uri).toBe(`${BASE}/projects/${P}/artifacts/${A}/render?format=html`);
		expect(calls[0].opts.encoding).toBeNull();
		expect(calls[0].opts.headers).toBe(HEADERS);
		expect(out).toMatchObject({ artifactId: A, projectId: P, format: 'html', encoding: 'base64', renderCache: 'miss', filename: 'render.html' });
		expect(Buffer.from(out.data, 'base64').toString()).toBe('<h1>x</h1>');
	});

	it('renderArtifact passes format=pdf from additionalOptions.format', async () => {
		const { ctx, calls } = makeCtx({ projectId: P, artifactId: A, additionalOptions: { format: 'pdf' } }, html);
		await executeOperation(ctx, BASE, HEADERS, 'artifacts', 'renderArtifact', 0);
		expect(calls[0].opts.uri).toBe(`${BASE}/projects/${P}/artifacts/${A}/render?format=pdf`);
	});

	it('artifactsRenderCrossProject hits /api/artifacts/{id}/render', async () => {
		const { ctx, calls } = makeCtx({ artifactId: A }, html);
		const out: any = await executeOperation(ctx, BASE, HEADERS, 'artifacts', 'artifactsRenderCrossProject', 0);
		expect(calls[0].opts.uri).toBe(`${BASE}/api/artifacts/${A}/render?format=html`);
		expect(out.projectId).toBeUndefined();
	});

	it('refuses an unknown format and a dot-segment id before any request', async () => {
		const bad = makeCtx({ projectId: P, artifactId: A, additionalOptions: { format: 'docx' } }, html);
		await expect(executeOperation(bad.ctx, BASE, HEADERS, 'artifacts', 'renderArtifact', 0)).rejects.toThrow(/html.*pdf/);
		expect(bad.calls).toHaveLength(0);
		const dot = makeCtx({ projectId: P, artifactId: '..' }, html);
		await expect(executeOperation(dot.ctx, BASE, HEADERS, 'artifacts', 'renderArtifact', 0)).rejects.toThrow(/dot-segment/);
		expect(dot.calls).toHaveLength(0);
	});
});

describe('backwards compatibility of the node description', () => {
	const PRE_DOC1_OPERATIONS = [
		'uploadArtifact', 'listArtifacts', 'getArtifact', 'deleteArtifact', 'downloadArtifact',
		'setArtifactPublishStatus', 'getManifest', 'submitArtifactReview', 'listArtifactReviews',
		'artifactsListCrossProject', 'artifactsListByCardCrossProject', 'artifactsGetCrossProject',
	];

	it('keeps every pre-DOC-1 operation value and the default operation', () => {
		const values = (artifactsOperations.options as Array<{ value: string }>).map((o) => o.value);
		for (const v of PRE_DOC1_OPERATIONS) expect(values).toContain(v);
		expect(artifactsOperations.default).toBe('uploadArtifact');
	});

	it('every new upload/metadata field is optional with an empty default', () => {
		for (const name of ['title', 'docType', 'phase', 'summary', 'plankaCardId']) {
			const f = artifactsFields.find((x) => x.name === name)!;
			expect(f).toBeDefined();
			expect(f.required).toBe(false);
			expect(f.default).toBe('');
		}
	});
});
