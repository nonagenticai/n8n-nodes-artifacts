import { describe, it, expect } from '@jest/globals';
import { NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions } from 'n8n-workflow';
import { parseJsonText } from '../../helpers/strictJson';
import { Artifacts } from '../../nodes/Artifacts/Artifacts.node';

/**
 * helpers/strictJson.ts (generated, n8n_module_scripts#161): the ONE JSON.parse a
 * hand-written file may use for a node FIELD. Invalid JSON must throw a
 * NodeOperationError that names the field, never a bare SyntaxError and never a
 * fallback to the raw text. Fails on origin/main, where the helper did not exist.
 */
const node = { name: 'Artifacts', type: 'n8n-nodes-artifacts.artifacts' };
const ctx = { getNode: () => node } as unknown as IExecuteFunctions;

describe('strictJson.parseJsonText', () => {
	it('returns the parsed value for valid JSON (object, array, null, scalar)', () => {
		expect(parseJsonText(ctx, 0, '{"a":1}', 'Body')).toEqual({ a: 1 });
		expect(parseJsonText(ctx, 0, '[1,2]', 'Body')).toEqual([1, 2]);
		expect(parseJsonText(ctx, 0, 'null', 'Body')).toBeNull();
		expect(parseJsonText(ctx, 0, '7', 'Body')).toBe(7);
	});

	it('throws a NodeOperationError naming the field for invalid JSON', () => {
		for (const bad of ['{a:1}', '', 'not json', '{"a":', "{'a':1}"]) {
			let err: unknown;
			try {
				parseJsonText(ctx, 3, bad, 'Metadata');
			} catch (e) {
				err = e;
			}
			expect(err).toBeInstanceOf(NodeOperationError);
			expect((err as Error).name).toBe('NodeOperationError');
			expect((err as Error).message).toMatch(/^Metadata is not valid JSON: /);
		}
	});
});

describe('Artifacts node field types', () => {
	it('declares no json-typed field (strict json parsing changes no request this node builds)', () => {
		const props = new Artifacts().description.properties as unknown[];
		const jsonFields: string[] = [];
		const walk = (xs: unknown, at: string): void => {
			if (!Array.isArray(xs)) return;
			for (const x of xs as Array<Record<string, unknown>>) {
				const here = at + '/' + String(x.name ?? '?');
				if (x.type === 'json') jsonFields.push(here);
				walk(x.options, here);
				walk(x.values, here);
			}
		};
		walk(props, '');
		expect(props.length).toBeGreaterThan(0);
		expect(jsonFields).toEqual([]);
	});
});
