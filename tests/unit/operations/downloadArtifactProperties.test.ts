/**
 * @file downloadArtifactProperties.test.ts
 * Regression guard for the downloadArtifact node-property (displayOptions) defect.
 *
 * The downloadArtifact handler builds
 *   GET {base}/projects/{projectId}/artifacts/{artifactId}/download
 * and reads both `projectId` and `artifactId` via getNodeParameter (no defaults).
 * n8n strips any parameter whose displayOptions do NOT list the active operation
 * on save/import, so if these fields are not shown for "downloadArtifact" the
 * value never reaches the handler and getNodeParameter throws
 * "Could not get parameter" at execution time (proven live 2026-07-11).
 *
 * downloadArtifact is a MANUAL (custom) non-multipart op, so generate-node's
 * path-param collection skips it — these displayOptions entries are maintained
 * in nodes/Artifacts/resources/artifacts.resource.ts and MUST survive regens.
 * This test fails if downloadArtifact is ever dropped from either field.
 */
import {
  artifactsFields,
  artifactsOperations,
} from '../../../nodes/Artifacts/resources/artifacts.resource';

function fieldByName(name: string) {
  const field = artifactsFields.find((f) => f.name === name);
  if (!field) throw new Error(`field "${name}" not found in artifactsFields`);
  return field;
}

function shownOperations(name: string): string[] {
  const field = fieldByName(name);
  const ops = field.displayOptions?.show?.operation;
  if (!Array.isArray(ops)) {
    throw new Error(`field "${name}" has no displayOptions.show.operation array`);
  }
  return ops as string[];
}

describe('downloadArtifact node properties', () => {
  it('exposes projectId for the downloadArtifact operation', () => {
    expect(shownOperations('projectId')).toContain('downloadArtifact');
  });

  it('exposes artifactId for the downloadArtifact operation', () => {
    expect(shownOperations('artifactId')).toContain('downloadArtifact');
  });

  it('offers downloadArtifact as a selectable operation', () => {
    const values = (artifactsOperations.options ?? []).map(
      (o: any) => o.value,
    );
    expect(values).toContain('downloadArtifact');
  });

  it('keeps projectId + artifactId aligned for every path-param download URL segment', () => {
    // The download URL needs BOTH slots; guard the pair together so a future
    // edit can't re-expose one without the other.
    const projectOps = shownOperations('projectId');
    const artifactOps = shownOperations('artifactId');
    expect(projectOps).toContain('downloadArtifact');
    expect(artifactOps).toContain('downloadArtifact');
  });
});
