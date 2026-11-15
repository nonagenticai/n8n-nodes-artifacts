# n8n-nodes-artifacts

[![CI](https://github.com/nonagenticai/n8n-nodes-artifacts/actions/workflows/ci.yml/badge.svg)](https://github.com/nonagenticai/n8n-nodes-artifacts/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/nonagenticai/n8n-nodes-artifacts)](https://github.com/nonagenticai/n8n-nodes-artifacts/releases)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

An n8n community node for the [Artifact Service](https://github.com/nonagenticai/artifact_service)
that gives n8n workflow authors one node for the artifact lifecycle — multi-tenant storage and
retrieval of project artifacts, with versioning, manifests, tagging, review status and sensitivity
levels.

> **Backend required.** This node talks to an Artifact Service instance you run yourself; there is no
> hosted service. The [service repository](https://github.com/nonagenticai/artifact_service) has a
> `docker-compose.yml` that gets one running locally.

| | |
|---|---|
| **Package** | `@nonagenticai/n8n-nodes-artifacts` **0.2.3** on npm |
| **Runtime** | Node.js as supplied by n8n; TypeScript compiled to CommonJS (ES2019) |
| **Depends on** | A running Artifact Service instance |
| **Runs on** | Any n8n instance that can load community node packages |

## Quick start

```bash
git clone https://github.com/nonagenticai/n8n-nodes-artifacts.git
cd n8n-nodes-artifacts
npm install
npm run build
```

The repository root is the npm package: `package.json`, `nodes/`, `credentials/` and the build
configuration all live at the top level. There is no nested `artifacts/` directory to copy, and
`npm run build` writes the compiled node to `dist/`.

To install it in n8n, install the published package
`@nonagenticai/n8n-nodes-artifacts` through n8n's Community Nodes settings, or install it into the
location where your n8n instance loads community nodes, then restart n8n. The node appears as
**Artifacts** under **Transform** and has `usableAsTool` enabled, so it can also be used as an AI
tool.

## Usage

A minimal upload from binary data:

1. Give the previous node an output item with a binary property (the node reads `data` by default).
2. Add the **Artifacts** node and choose **Upload Artifact**.
3. Set **Project ID**, **Filename**, **Content Type** and **Kind**. These are required by the
   service. Optionally set **Card ID**, **Step**, **Container Name**, **Sensitivity**,
   **Tags**, or the document metadata fields.

The node sends a `multipart/form-data` request to
`POST {baseUrl}/projects/{projectId}/artifacts/upload`. A successful upload returns the created
artifact:

```json
{
  "artifact_id": "bb4f5a67-c12d-34e5-f678-9012a3b4c5d6",
  "version": 1,
  "storage_key": "projects/3f2e4d5c-6a7b-8c9d-0e1f-2a3b4c5d6e7f/v1/report.pdf",
  "size": 2457600,
  "sha256": "a3c5f7e9b2d4c6a8f0e1d3b5c7a9f1e3d5b7c9a1f3e5d7b9c1a3f5e7d9b1c3a5"
}
```

To list artifacts, choose **List Artifacts**, set **Project ID**, and add filters under
**Additional Options**. The service returns an array; the node emits one n8n item per artifact.

**Download Artifact** and **Render Artifact** return the response bytes as base64 inside
`json.data`, not as an n8n binary property. Reconstruct the file in a downstream Code node:

```js
Buffer.from($json.data, "base64");
```

## Configuration

The node uses the **Artifacts API** credential:

| Field | Required | Meaning |
|---|---|---|
| **Base URL** | For the credential test | Artifacts API base URL, for example `https://artifacts.example.com`. Required for the credential's **Test** button, which requests `GET /api/artifacts?limit=1` on this URL. |
| **API Token** | Yes | Token sent as `Authorization: Bearer <token>`. When **Tenant ID** is empty it is also sent as `X-Tenant-Id: Bearer <token>`, which lets the service resolve the tenant. |
| **Tenant ID** | No | A tenant UUID override, sent as `X-Tenant-Id: <uuid>`. Leave empty unless you need to pin a specific tenant; a non-UUID value is rejected by the service. |

If the credential's **Base URL** is empty, node calls fall back to the `ARTIFACTS_API_URL`
environment variable. The credential always wins; if both are set and differ, the node logs a
warning naming both values. The credential test itself has no environment fallback, so set
**Base URL** on the credential to use it.

| Variable | Default | Meaning |
|---|---|---|
| `ARTIFACTS_API_URL` | empty | Deployment default for the API base URL when the credential's **Base URL** is empty. |

## Operations

The node exposes **15 operations**: 11 scoped to one project and 4 tenant-wide (cross-project).
Project-scoped operations require **Project ID**; operations that act on one artifact also require
**Artifact ID**.

### Project-scoped

| Operation | Request | What it does |
|---|---|---|
| **Upload Artifact** | `POST /projects/{projectId}/artifacts/upload` | Multipart upload from a binary property (default `data`) or a **File Path**. Returns `artifact_id`, `version`, `storage_key`, `size` and `sha256`. |
| **List Artifacts** | `GET /projects/{projectId}/artifacts` | List artifacts with the filters below. Returns one n8n item per artifact. |
| **Get Artifact** | `GET /projects/{projectId}/artifacts/{artifactId}` | Retrieve one artifact's metadata. |
| **Delete Artifact** | `DELETE /projects/{projectId}/artifacts/{artifactId}` | Delete an artifact. The service answers `204 No Content`. |
| **Download Artifact** | `GET /projects/{projectId}/artifacts/{artifactId}/download` | Download the artifact bytes. Returns base64 `data` plus `filename`, `contentType` and `contentLength`. |
| **Set Artifact Publish Status** | `PATCH /projects/{projectId}/artifacts/{artifactId}/publish-status` | Set `publish_status` to `draft` or `published`. |
| **Update Artifact Metadata** | `PATCH /projects/{projectId}/artifacts/{artifactId}/metadata` | Update `title`, `doc_type`, `phase`, `summary`, `card_id` or `planka_card_id`. |
| **Render Artifact** | `GET /projects/{projectId}/artifacts/{artifactId}/render` | Render the artifact and return base64 `data`, `filename`, `contentType` and `renderCache`. The node sends the default format `html`; the handler also accepts `pdf`, but the current node UI exposes no format field. |
| **Get Manifest** | `GET /projects/{projectId}/artifacts/manifests/{scope}` | Aggregate artifacts at `project`, `card` or `step` scope. Supply **Scope Reference** for card and step. Optional limit and offset. |
| **Submit Artifact Review** | `POST /projects/{projectId}/artifacts/{artifactId}/review` | Submit a **Decision** of `approve`, `reject` or `revise`, with an optional comment. |
| **List Artifact Reviews** | `GET /projects/{projectId}/artifacts/{artifactId}/reviews` | List an artifact's review history. Optional limit and offset. |

### Tenant-wide (cross-project)

| Operation | Request | What it does |
|---|---|---|
| **Artifacts List Cross Project** | `GET /api/artifacts` | List artifacts across all projects in the tenant, with the same filters as **List Artifacts**. |
| **Artifacts List By Card Cross Project** | `GET /api/artifacts/by-card/{cardId}` | List artifacts for one **Card ID** across all projects. Optional name prefix, limit and offset. |
| **Artifacts Get Cross Project** | `GET /api/artifacts/{artifactId}` | Retrieve artifact metadata by ID across all projects. |
| **Artifacts Render Cross Project** | `GET /api/artifacts/{artifactId}/render` | Render an artifact by ID across all projects. Same base64 output as **Render Artifact**; the node sends `html`. |

### Shared list filters

**List Artifacts** and **Artifacts List Cross Project** accept these filters under
**Additional Options**:

- **Card ID**, **Step**, **Kind**, **Sensitivity**, **Name Prefix**, **Phase**, **Doc Type**,
  **Planka Card ID**
- **Tags** — comma-separated; the node sends each tag as a repeated query parameter
- **Limit** — 1 to 1000; the node defaults to 100
- **Offset** — defaults to 0

### Artifact kinds

| Kind | Typical contents |
|---|---|
| `doc` | PDF, Word, text, Markdown |
| `presentation` | PowerPoint, Keynote, PDF slides |
| `image` | PNG, JPG, SVG, GIF, WebP |
| `dataset` | CSV, Excel, Parquet, JSON-LD |
| `json` | Config files and API responses |
| `graph` | PlantUML, GraphML, Mermaid |
| `other` | Anything else |

### Sensitivity, publish status and review status

- **Sensitivity** is `public`, `internal` or `secret`. When the node sends no value, the service
  default is `internal`.
- **Publish status** is `draft` or `published`. A published system-tenant artifact is inherited
  read-only by every other tenant; a draft one never leaves the system tenant.
- **Review status** is a separate axis from publish status: `pending`, `approved`, `rejected` or
  `needs_revision`. A **Submit Artifact Review** decision maps to it (`approve`, `reject` or
  `revise`).

### Manifest scopes

| Scope | Scope Reference |
|---|---|
| `project` | Not used |
| `card` | Card UUID |
| `step` | Step identifier, for example `QA:validation` |

## Error handling

With **Continue on Fail** enabled, a failed item is returned as JSON rather than stopping the
workflow:

```json
{
  "error": "Request failed with status code 400",
  "resource": "artifacts",
  "operation": "getArtifact",
  "statusCode": 400,
  "errorCode": "INVALID_TENANT_ID"
}
```

`statusCode` is `null` when the failure produced no HTTP status, such as a transport failure.
`errorCode` carries the service's machine-readable code when the response includes one.

Read requests (`GET`) are retried up to three attempts on a `5xx` response or a transient network
error. Write requests are retried only when the request provably never reached the server
(connection refused or DNS failure), so a write is never double-applied.

| Status | Meaning |
|---|---|
| `400` | Invalid parameter or request body |
| `401` / `403` | Token rejected, or the token is not permitted to perform the operation |
| `404` | Project or artifact not found |
| `422` | Request failed validation |
| `5xx` | Service error |

## Development

```bash
npm install
npm run build   # tsc && gulp build:icons
npm run lint
npm test
```

`npm run build` compiles `index.ts`, `nodes/`, `credentials/`, `src/` and `helpers/` with
`tsc`, then copies the SVG icons into `dist/`. `tsc` emits a `.d.ts` declaration beside every
compiled `.js` file. The key paths in the build output are:

```
dist/
├── index.js
├── index.d.ts
├── nodes/Artifacts/
│   ├── Artifacts.node.js
│   ├── artifacts.svg
│   ├── operations/index.js
│   └── resources/
│       ├── artifacts.resource.js
│       └── index.js
├── credentials/
│   ├── ArtifactsApi.credentials.js
│   └── artifacts.svg
├── helpers/*.js
└── src/generated/
    ├── api-client.js
    └── models/*.js
```

`package.json` points n8n at `dist/credentials/ArtifactsApi.credentials.js` and
`dist/nodes/Artifacts/Artifacts.node.js`, sets `main` to `dist/index.js` and `types` to
`dist/index.d.ts`, and limits the published package to `dist/`.

CI (`.github/workflows/ci.yml`) runs a secret scan, a private-reference scan, then build, lint and
test on GitHub-hosted runners with Node.js 26.13.0. A `v*` tag whose version matches
`package.json` publishes the package to npm with provenance.

The API client under `src/generated/` is generated by [Orval](https://orval.dev/) from
`docs/openapi.json`; see `orval.config.ts` for the mapping.

## Security

Report vulnerabilities privately through the repository's Security tab — see
[`SECURITY.md`](SECURITY.md). Do not open a public issue for a security problem.

## Contributing

Issues and pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the development
commands, the one-concern-per-pull-request rule and the DCO sign-off it asks of contributors.

## Licensing

The code in this repository is Apache-2.0 and needs no licence key to build, test or run.
It contains no licence-enforcement code: the Apache-2.0 licence in [`LICENSE`](LICENSE) is the
only licence that applies, and no licence server is involved.

## License

Apache-2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). The n8n runtime itself is licensed separately by n8n GmbH; this node's own code is Apache-2.0.
