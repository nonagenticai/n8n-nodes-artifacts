# Artifacts API Reference

Complete API documentation for the n8n Artifacts node.

**Version:** 1.0.0
**Base URL:** `https://artifacts.example.com` (configurable)
**Authentication:** Bearer token (API Key or OAuth2)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Operations Overview](#operations-overview)
3. [Health Check](#health-check)
4. [Sign Upload](#sign-upload)
5. [Finalize Upload](#finalize-upload)
6. [List Artifacts](#list-artifacts)
7. [Get Artifact](#get-artifact)
8. [Delete Artifact](#delete-artifact)
9. [Download Artifact](#download-artifact)
10. [Get Manifest](#get-manifest)
11. [Error Responses](#error-responses)
12. [Data Models](#data-models)

---

## Authentication

All API requests (except health check) require authentication via Bearer token in the `Authorization` header.

### Header Format

```http
Authorization: Bearer {api_key_or_token}
Content-Type: application/json
```

### Authentication Methods

#### 1. API Key (Legacy)
```typescript
headers: {
  'Authorization': 'Bearer sk_live_your_api_key_here'
}
```

#### 2. Keycloak OAuth2 (Recommended)
The ServiceAuthenticator automatically manages OAuth2 tokens:
- Acquires tokens using client credentials flow
- Caches tokens with automatic refresh
- Handles token expiration (default: refresh 60s before expiry)
- Instance-level caching prevents token leakage

```typescript
// Automatically handled by ArtifactsApi credentials
// No manual token management required
```

---

## Operations Overview

| Operation | HTTP Method | Endpoint | Purpose |
|-----------|-------------|----------|---------|
| Health Check | GET | `/health` | Verify API availability |
| Sign Upload | POST | `/projects/{project_id}/artifacts/sign-upload` | Get presigned upload URL |
| Finalize Upload | POST | `/projects/{project_id}/artifacts/finalize` | Complete artifact registration |
| List Artifacts | GET | `/projects/{project_id}/artifacts` | Query artifacts with filters |
| Get Artifact | GET | `/projects/{project_id}/artifacts/{artifact_id}` | Retrieve artifact metadata |
| Delete Artifact | DELETE | `/projects/{project_id}/artifacts/{artifact_id}` | Remove artifact |
| Download Artifact | GET | `/projects/{project_id}/artifacts/{artifact_id}/download` | Get presigned download URL |
| Get Manifest | GET | `/projects/{project_id}/artifacts/manifests/{scope}` | Aggregate artifact statistics |

---

## Health Check

Verify that the Artifacts API service is available and healthy.

### Endpoint

```http
GET /health
```

### Parameters

None

### Response

**Status Code:** `200 OK`

```json
{
  "status": "healthy",
  "service": "Artifact Registry Service",
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "checks": {
    "database": true,
    "minio": true,
    "clamav": false
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Overall health status: `healthy`, `degraded`, or `unhealthy` |
| `service` | string | Service name identifier |
| `version` | string | API version (semantic versioning) |
| `timestamp` | string | ISO 8601 timestamp of health check |
| `checks` | object | Status of individual service dependencies |
| `checks.database` | boolean | PostgreSQL database connectivity |
| `checks.minio` | boolean | MinIO object storage connectivity |
| `checks.clamav` | boolean | ClamAV virus scanner availability (optional) |

### Error Responses

| Status Code | Description |
|-------------|-------------|
| `503 Service Unavailable` | Service is down or not responding |

### Example Usage

```javascript
// n8n workflow node configuration
Operation: Health Check
// No parameters required

// Response handling
if (response.status === 'healthy' && response.checks.database && response.checks.minio) {
  // Proceed with artifact operations
} else {
  // Alert or retry
}
```

---

## Sign Upload

Generate a presigned URL for uploading an artifact to MinIO storage.

**This is Step 1 of the 3-step upload process:**
1. **Sign Upload** → Get presigned URL and token
2. **External PUT** → Upload file to presigned URL
3. **Finalize Upload** → Complete artifact registration

### Endpoint

```http
POST /projects/{project_id}/artifacts/sign-upload
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | UUID | Yes | Unique identifier of the project |

### Request Body

```json
{
  "filename": "report.pdf",
  "content_type": "application/pdf",
  "kind": "doc",
  "card_id": "123e4567-e89b-12d3-a456-426614174000",
  "step": null,
  "container_name": "sprint-2024-q4",
  "sensitivity": "internal",
  "tags": ["quarterly", "finance"]
}
```

### Request Fields

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `filename` | string | Yes | Name of the file | 1-255 chars, no path separators (/, \, ..) |
| `content_type` | string | Yes | MIME type of file | Valid MIME type (e.g., `application/pdf`) |
| `kind` | enum | Yes | Artifact type | `doc`, `presentation`, `image`, `dataset`, `json`, `graph`, `other` |
| `card_id` | UUID | No | Associated card ID | Valid UUID, mutually exclusive with `step` |
| `step` | string | No | Step identifier | Max 100 chars (e.g., `QA:validation`), mutually exclusive with `card_id` |
| `container_name` | string | No | Container for grouping | Max 100 chars |
| `sensitivity` | enum | No | Sensitivity level | `public`, `internal` (default), `secret` |
| `tags` | array | No | Tags for categorization | Max 20 tags, each max 50 chars |

### Response

**Status Code:** `200 OK`

```json
{
  "upload_url": "https://minio:9000/artifacts/projects/3f2e4d5c.../upload?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
  "storage_key": "projects/3f2e4d5c.../card/123e4567.../artifact-uuid/v1/report.pdf",
  "artifact_token": "example-artifact-token",
  "expires_in_seconds": 3600
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `upload_url` | string | Presigned MinIO URL for HTTP PUT upload (single-use) |
| `storage_key` | string | Internal storage path (informational, do not modify) |
| `artifact_token` | string | Token for finalize call (keep secure, expires with URL) |
| `expires_in_seconds` | integer | URL expiration time in seconds (typically 3600 = 1 hour) |

### Error Responses

| Status Code | Error | Description |
|-------------|-------|-------------|
| `400 Bad Request` | `invalid_filename` | Filename contains path separators or is invalid |
| `400 Bad Request` | `invalid_kind` | Kind is not one of the allowed values |
| `400 Bad Request` | `mutually_exclusive_fields` | Both `card_id` and `step` provided |
| `404 Not Found` | `project_not_found` | Project ID does not exist or no access |
| `422 Unprocessable Entity` | `validation_error` | Request body validation failed |

### Example Usage

```javascript
// n8n workflow node configuration
Operation: Sign Upload
Project ID: {{$node["Get Project"].json.id}}
Filename: report-{{$now.format("yyyy-MM-dd")}}.pdf
Content Type: application/pdf
Kind: doc
Sensitivity: internal
Tags: ["monthly-report", "finance"]

// Store response for next steps
const uploadUrl = $json.upload_url;
const artifactToken = $json.artifact_token;
```

### Next Steps

After receiving the response:

1. **Upload the file** to `upload_url` using HTTP PUT:
   ```bash
   curl -X PUT "${upload_url}" \
     -H "Content-Type: application/pdf" \
     --data-binary "@report.pdf"
   ```

2. **Calculate SHA256** checksum of the uploaded file:
   ```bash
   sha256sum report.pdf
   # Output: a3c5f7e9...  report.pdf
   ```

3. **Call Finalize Upload** with the token and metadata

---

## Finalize Upload

Complete the artifact upload process after uploading the file to the presigned URL.

**This is Step 3 of the 3-step upload process.**

### Endpoint

```http
POST /projects/{project_id}/artifacts/finalize
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | UUID | Yes | Unique identifier of the project |

### Request Body

```json
{
  "artifact_token": "example-artifact-token",
  "size": 2457600,
  "sha256": "a3c5f7e9b2d4c6a8f0e1d3b5c7a9f1e3d5b7c9a1f3e5d7b9c1a3f5e7d9b1c3a5"
}
```

### Request Fields

| Field | Type | Required | Description | Constraints |
|-------|------|----------|-------------|-------------|
| `artifact_token` | string | Yes | Token from sign-upload response | Must be valid and not expired |
| `size` | integer | Yes | File size in bytes | Must be > 0 |
| `sha256` | string | Yes | SHA256 checksum of file | Exactly 64 lowercase hex characters |

### Response

**Status Code:** `200 OK`

```json
{
  "artifact_id": "bb4f5a67-c12d-34e5-f678-9012a3b4c5d6",
  "version": 1,
  "storage_key": "projects/3f2e4d5c.../card/123e4567.../bb4f5a67.../v1/report.pdf"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `artifact_id` | UUID | Unique identifier of the created artifact |
| `version` | integer | Version number (1 for new artifacts) |
| `storage_key` | string | Internal storage path where file is stored |

### Error Responses

| Status Code | Error | Description |
|-------------|-------|-------------|
| `400 Bad Request` | `invalid_token` | Artifact token is invalid or expired |
| `400 Bad Request` | `checksum_mismatch` | SHA256 does not match uploaded file |
| `400 Bad Request` | `size_mismatch` | Size does not match uploaded file |
| `400 Bad Request` | `virus_detected` | File failed virus scan (if enabled) |
| `404 Not Found` | `token_not_found` | Token does not exist or already used |
| `422 Unprocessable Entity` | `validation_error` | Request body validation failed |

### Example Usage

```javascript
// n8n workflow node configuration
Operation: Finalize Upload
Project ID: {{$node["Get Project"].json.id}}
Artifact Token: {{$node["Sign Upload"].json.artifact_token}}
Size: {{$node["File Info"].json.size}}
SHA256: {{$node["Calculate Checksum"].json.sha256}}

// Response contains artifact ID for future reference
const artifactId = $json.artifact_id;
```

### Important Notes

- Token expires after the time specified in `expires_in_seconds` from sign-upload
- SHA256 must be **lowercase** hexadecimal (64 characters)
- Size must be an **integer** (whole number of bytes)
- Token is single-use and cannot be reused after finalization
- If virus scanning is enabled, this step may take longer

---

## List Artifacts

Retrieve a list of artifacts for a project with optional filtering and pagination.

### Endpoint

```http
GET /projects/{project_id}/artifacts
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | UUID | Yes | Unique identifier of the project |

### Query Parameters

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| `card_id` | UUID | No | Filter by associated card ID | - |
| `step` | string | No | Filter by step identifier | - |
| `kind` | enum | No | Filter by artifact type | - |
| `sensitivity` | enum | No | Filter by sensitivity level | - |
| `tags` | array | No | Filter by tags (artifacts matching ALL tags) | - |
| `limit` | integer | No | Maximum number of results | `100` |
| `offset` | integer | No | Number of items to skip (pagination) | `0` |

### Query String Example

```
GET /projects/3f2e4d5c-6a7b-8c9d-0e1f-2a3b4c5d6e7f/artifacts?kind=doc&sensitivity=internal&limit=50&offset=0
```

### Response

**Status Code:** `200 OK`

```json
[
  {
    "id": "bb4f5a67-c12d-34e5-f678-9012a3b4c5d6",
    "version": 1,
    "filename": "report.pdf",
    "content_type": "application/pdf",
    "kind": "doc",
    "project_id": "3f2e4d5c-6a7b-8c9d-0e1f-2a3b4c5d6e7f",
    "card_id": "123e4567-e89b-12d3-a456-426614174000",
    "step": null,
    "container_name": "sprint-2024-q4",
    "sensitivity": "internal",
    "size": 2457600,
    "sha256": "a3c5f7e9b2d4c6a8f0e1d3b5c7a9f1e3d5b7c9a1f3e5d7b9c1a3f5e7d9b1c3a5",
    "storage_key": "projects/3f2.../card/123.../bb4.../v1/report.pdf",
    "created_at": "2024-01-15T10:30:45.123Z",
    "created_by": "john.doe",
    "tags": ["quarterly", "finance"]
  }
]
```

### Response Fields

See [Artifact Object](#artifact-object) in Data Models section.

### Error Responses

| Status Code | Error | Description |
|-------------|-------|-------------|
| `404 Not Found` | `project_not_found` | Project ID does not exist or no access |
| `422 Unprocessable Entity` | `validation_error` | Invalid query parameters |

### Pagination

To paginate through results:

```javascript
// Page 1 (first 50 items)
limit: 50, offset: 0

// Page 2 (next 50 items)
limit: 50, offset: 50

// Page 3
limit: 50, offset: 100
```

### Filtering Examples

```javascript
// Get all documents from QA step
filterKind: 'doc'
filterStep: 'QA:validation'

// Get secret artifacts with specific tags
filterSensitivity: 'secret'
filterTags: ['confidential', 'archived']

// Get artifacts for a specific card
filterCardId: '123e4567-e89b-12d3-a456-426614174000'
```

---

## Get Artifact

Retrieve metadata for a specific artifact by ID.

### Endpoint

```http
GET /projects/{project_id}/artifacts/{artifact_id}
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | UUID | Yes | Unique identifier of the project |
| `artifact_id` | UUID | Yes | Unique identifier of the artifact |

### Response

**Status Code:** `200 OK`

```json
{
  "id": "bb4f5a67-c12d-34e5-f678-9012a3b4c5d6",
  "version": 1,
  "filename": "report.pdf",
  "content_type": "application/pdf",
  "kind": "doc",
  "project_id": "3f2e4d5c-6a7b-8c9d-0e1f-2a3b4c5d6e7f",
  "card_id": "123e4567-e89b-12d3-a456-426614174000",
  "step": null,
  "container_name": "sprint-2024-q4",
  "sensitivity": "internal",
  "size": 2457600,
  "sha256": "a3c5f7e9b2d4c6a8f0e1d3b5c7a9f1e3d5b7c9a1f3e5d7b9c1a3f5e7d9b1c3a5",
  "storage_key": "projects/3f2.../card/123.../bb4.../v1/report.pdf",
  "created_at": "2024-01-15T10:30:45.123Z",
  "created_by": "john.doe",
  "tags": ["quarterly", "finance"]
}
```

### Response Fields

See [Artifact Object](#artifact-object) in Data Models section.

### Error Responses

| Status Code | Error | Description |
|-------------|-------|-------------|
| `404 Not Found` | `artifact_not_found` | Artifact ID does not exist or no access |
| `404 Not Found` | `project_not_found` | Project ID does not exist or no access |

### Example Usage

```javascript
// n8n workflow node configuration
Operation: Get Artifact
Project ID: {{$node["variables"].json.project_id}}
Artifact ID: {{$node["List Artifacts"].json[0].id}}

// Use response to check artifact properties
if ($json.sensitivity === 'secret') {
  // Handle secret artifact
}
```

---

## Delete Artifact

Permanently delete an artifact from the registry.

### Endpoint

```http
DELETE /projects/{project_id}/artifacts/{artifact_id}
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | UUID | Yes | Unique identifier of the project |
| `artifact_id` | UUID | Yes | Unique identifier of the artifact |

### Response

**Status Code:** `204 No Content`

No response body. Success is indicated by the 204 status code.

### Error Responses

| Status Code | Error | Description |
|-------------|-------|-------------|
| `404 Not Found` | `artifact_not_found` | Artifact ID does not exist or already deleted |
| `404 Not Found` | `project_not_found` | Project ID does not exist or no access |
| `403 Forbidden` | `insufficient_permissions` | No permission to delete this artifact |

### Important Notes

- **Deletion is permanent** and cannot be undone
- The file is removed from MinIO storage
- Database record is deleted
- Only artifacts owned by your project can be deleted
- Requires appropriate delete permissions

### Example Usage

```javascript
// n8n workflow node configuration
Operation: Delete Artifact
Project ID: {{$node["variables"].json.project_id}}
Artifact ID: {{$node["Get Artifact"].json.id}}

// n8n node returns success indicator
{
  "success": true,
  "message": "Artifact deleted successfully",
  "artifactId": "bb4f5a67-c12d-34e5-f678-9012a3b4c5d6",
  "projectId": "3f2e4d5c-6a7b-8c9d-0e1f-2a3b4c5d6e7f"
}
```

---

## Download Artifact

Get a presigned URL for downloading an artifact from MinIO storage.

### Endpoint

```http
GET /projects/{project_id}/artifacts/{artifact_id}/download
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | UUID | Yes | Unique identifier of the project |
| `artifact_id` | UUID | Yes | Unique identifier of the artifact |

### Response

**Status Code:** `200 OK`

```json
{
  "download_url": "https://minio:9000/artifacts/projects/3f2.../download?X-Amz-Algorithm=AWS4-HMAC-SHA256&...",
  "expires_in": 3600,
  "content_type": "application/pdf",
  "size": 2457600
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `download_url` | string | Presigned MinIO URL for HTTP GET download |
| `expires_in` | integer | URL expiration time in seconds (typically 3600 = 1 hour) |
| `content_type` | string | MIME type of the file |
| `size` | integer | File size in bytes |

### Error Responses

| Status Code | Error | Description |
|-------------|-------|-------------|
| `404 Not Found` | `artifact_not_found` | Artifact ID does not exist or no access |
| `404 Not Found` | `project_not_found` | Project ID does not exist or no access |

### Usage

1. Call this endpoint to get the presigned download URL
2. Use the URL to download the file via HTTP GET (within expiration time)
3. The URL is valid for the time specified in `expires_in`

### Example Usage

```javascript
// n8n workflow: Get download URL
Operation: Download Artifact
Project ID: {{$node["variables"].json.project_id}}
Artifact ID: {{$node["Get Artifact"].json.id}}

// Response
const downloadUrl = $json.download_url;

// n8n workflow: Download file using HTTP Request node
Method: GET
URL: {{$node["Download Artifact"].json.download_url}}
// Downloads file directly

// Or send URL to user via email
Email Body: `Download your file: ${downloadUrl}`
```

---

## Get Manifest

Get an aggregated manifest of artifacts for a specific scope (project, card, or step).

### Endpoint

```http
GET /projects/{project_id}/artifacts/manifests/{scope}
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | UUID | Yes | Unique identifier of the project |
| `scope` | enum | Yes | Scope level: `project`, `card`, or `step` |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scope_ref` | string | Conditional | Required for `card` (UUID) and `step` (identifier) scopes |

### Query String Examples

```
# Project-wide manifest (no scope_ref needed)
GET /projects/3f2e4d5c.../artifacts/manifests/project

# Card-specific manifest
GET /projects/3f2e4d5c.../artifacts/manifests/card?scope_ref=123e4567-e89b-12d3-a456-426614174000

# Step-specific manifest
GET /projects/3f2e4d5c.../artifacts/manifests/step?scope_ref=QA:validation
```

### Response

**Status Code:** `200 OK`

```json
{
  "project_id": "3f2e4d5c-6a7b-8c9d-0e1f-2a3b4c5d6e7f",
  "scope": "card",
  "scope_ref": "123e4567-e89b-12d3-a456-426614174000",
  "artifacts": [
    {
      "id": "bb4f5a67-c12d-34e5-f678-9012a3b4c5d6",
      "filename": "report.pdf",
      "kind": "doc",
      "size": 2457600,
      "created_at": "2024-01-15T10:30:45.123Z",
      "created_by": "john.doe"
    },
    {
      "id": "cc5e6b78-d23e-45f6-g789-0123b4c5d6e7",
      "filename": "analysis.csv",
      "kind": "dataset",
      "size": 1048576,
      "created_at": "2024-01-16T14:22:10.456Z",
      "created_by": "jane.smith"
    }
  ],
  "total_count": 2,
  "total_size": 3506176,
  "kind_breakdown": {
    "doc": 1,
    "dataset": 1
  },
  "sensitivity_breakdown": {
    "internal": 2
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `project_id` | UUID | Project identifier |
| `scope` | enum | Scope level: `project`, `card`, or `step` |
| `scope_ref` | string | Scope reference (UUID for card, identifier for step) |
| `artifacts` | array | List of artifact summaries |
| `total_count` | integer | Total number of artifacts in scope |
| `total_size` | integer | Total size of all artifacts in bytes |
| `kind_breakdown` | object | Count of artifacts by kind |
| `sensitivity_breakdown` | object | Count of artifacts by sensitivity |

### Error Responses

| Status Code | Error | Description |
|-------------|-------|-------------|
| `400 Bad Request` | `invalid_scope` | Scope is not one of: project, card, step |
| `400 Bad Request` | `missing_scope_ref` | scope_ref required for card/step scopes |
| `404 Not Found` | `project_not_found` | Project ID does not exist or no access |
| `404 Not Found` | `scope_ref_not_found` | Card or step reference not found |

### Use Cases

- **Project Manifests**: Overall artifact statistics and storage usage
- **Card Manifests**: All artifacts associated with a specific card
- **Step Manifests**: All artifacts produced by a specific workflow step

### Example Usage

```javascript
// Project-wide manifest
Operation: Get Manifest
Project ID: {{$node["variables"].json.project_id}}
Scope: project
// Scope Ref: (leave empty for project scope)

// Card-specific manifest
Operation: Get Manifest
Project ID: {{$node["variables"].json.project_id}}
Scope: card
Scope Ref: {{$node["Get Card"].json.id}}

// Step-specific manifest
Operation: Get Manifest
Project ID: {{$node["variables"].json.project_id}}
Scope: step
Scope Ref: QA:validation

// Use response for reporting
const totalSize = $json.total_size;
const totalCount = $json.total_count;
const avgSize = totalSize / totalCount;
```

---

## Error Responses

All error responses follow a consistent format.

### Error Response Structure

```json
{
  "detail": "Error message describing what went wrong"
}
```

Or for validation errors:

```json
{
  "detail": [
    {
      "loc": ["body", "filename"],
      "msg": "field required",
      "type": "value_error.missing"
    },
    {
      "loc": ["body", "sha256"],
      "msg": "string does not match regex '^[a-f0-9]{64}$'",
      "type": "value_error.str.regex",
      "ctx": {
        "pattern": "^[a-f0-9]{64}$"
      }
    }
  ]
}
```

### Common HTTP Status Codes

| Status Code | Meaning | Typical Cause |
|-------------|---------|---------------|
| `200 OK` | Success | Request completed successfully |
| `204 No Content` | Success (no body) | Resource deleted successfully |
| `400 Bad Request` | Invalid request | Malformed request, invalid parameters |
| `401 Unauthorized` | Authentication failed | Missing or invalid API key/token |
| `403 Forbidden` | Access denied | Insufficient permissions for operation |
| `404 Not Found` | Resource not found | Project, artifact, or reference doesn't exist |
| `422 Unprocessable Entity` | Validation error | Request body failed validation |
| `500 Internal Server Error` | Server error | Temporary service issue |
| `503 Service Unavailable` | Service down | API or dependencies unavailable |

### Error Handling in n8n

Enable **Continue on Fail** to handle errors gracefully:

```javascript
// n8n node configuration
Continue on Fail: true

// Error handling in next node
const error = $node["Artifacts Operation"].json.error;
if (error) {
  // Log error
  // Send alert
  // Retry operation
}
```

---

## Data Models

### Artifact Object

Complete artifact metadata object returned by Get Artifact and List Artifacts operations.

```typescript
interface ArtifactOut {
  id: string;                  // UUID of the artifact
  version: number;             // Version number (1 for new artifacts)
  filename: string;            // Original filename
  content_type: string;        // MIME type
  kind: ArtifactKind;          // Type of artifact
  project_id: string;          // UUID of the project
  card_id?: string;            // UUID of associated card (optional)
  step?: string;               // Step identifier (optional)
  container_name?: string;     // Container for grouping (optional)
  sensitivity: Sensitivity;    // Sensitivity level
  size: number;                // File size in bytes
  sha256: string;              // SHA256 checksum (64 hex chars)
  storage_key: string;         // Internal storage path
  created_at: string;          // ISO 8601 timestamp
  created_by: string;          // Username of creator
  tags?: string[];             // Tags for categorization (optional)
}
```

### Artifact Kind Enum

```typescript
type ArtifactKind =
  | 'doc'           // Documents: PDF, Word, Text, Markdown
  | 'presentation'  // Presentations: PowerPoint, Keynote, PDF slides
  | 'image'         // Images: PNG, JPG, SVG, GIF, WebP
  | 'dataset'       // Datasets: CSV, Excel, Parquet, JSON-LD
  | 'json'          // JSON: Config files, API responses
  | 'graph'         // Graphs: PlantUML, GraphML, Mermaid
  | 'other';        // Other file types
```

### Sensitivity Enum

```typescript
type Sensitivity =
  | 'public'    // Publicly shareable content
  | 'internal'  // Internal use (default)
  | 'secret';   // Highly sensitive/restricted
```

### Sign Upload Request

```typescript
interface SignUploadRequest {
  filename: string;                    // 1-255 chars, no path separators
  content_type: string;                // Valid MIME type
  kind: ArtifactKind;                  // Artifact type
  card_id?: string;                    // UUID (mutually exclusive with step)
  step?: string;                       // Max 100 chars (mutually exclusive with card_id)
  container_name?: string;             // Max 100 chars
  sensitivity?: Sensitivity;           // Default: internal
  tags?: string[];                     // Max 20 tags, each max 50 chars
}
```

### Sign Upload Response

```typescript
interface SignUploadResponse {
  upload_url: string;           // Presigned MinIO URL for PUT
  storage_key: string;          // Internal storage path
  artifact_token: string;       // Token for finalize (single-use)
  expires_in_seconds: number;   // URL expiration time (typically 3600)
}
```

### Finalize Upload Request

```typescript
interface FinalizeUploadRequest {
  artifact_token: string;  // Token from sign-upload
  size: number;            // File size in bytes (must be > 0)
  sha256: string;          // SHA256 checksum (64 lowercase hex chars)
}
```

### Finalize Upload Response

```typescript
interface FinalizeUploadResponse {
  artifact_id: string;   // UUID of created artifact
  version: number;       // Version number (1 for new)
  storage_key: string;   // Internal storage path
}
```

### Manifest Response

```typescript
interface ManifestResponse {
  project_id: string;              // UUID of the project
  scope: 'project' | 'card' | 'step';  // Scope level
  scope_ref?: string;              // Scope reference (for card/step)
  artifacts: ArtifactSummary[];    // List of artifact summaries
  total_count: number;             // Total number of artifacts
  total_size: number;              // Total size in bytes
  kind_breakdown?: {               // Count by kind
    [key: string]: number;
  };
  sensitivity_breakdown?: {        // Count by sensitivity
    [key: string]: number;
  };
}

interface ArtifactSummary {
  id: string;           // UUID
  filename: string;     // Original filename
  kind: ArtifactKind;   // Type
  size: number;         // Size in bytes
  created_at: string;   // ISO 8601 timestamp
  created_by: string;   // Username
}
```

### Health Response

```typescript
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';  // Overall status
  service: string;                                // Service name
  version: string;                                // API version
  timestamp: string;                              // ISO 8601 timestamp
  checks: {
    database: boolean;   // PostgreSQL connectivity
    minio: boolean;      // MinIO connectivity
    clamav?: boolean;    // ClamAV availability (optional)
  };
}
```

---

## Rate Limits

*Currently no rate limits are enforced. This section will be updated when rate limiting is implemented.*

---

## Versioning

The API uses semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

**Current Version:** 1.0.0

API version is returned in the health check response.

---

## Best Practices

### Security

1. **Never expose API keys** in logs or error messages
2. **Use HTTPS** for all requests (enforce in production)
3. **Set appropriate sensitivity levels** for artifacts
4. **Rotate API keys** regularly
5. **Validate checksums** to ensure file integrity

### Performance

1. **Use pagination** for large result sets (limit max 1000)
2. **Cache manifests** if querying frequently
3. **Upload large files** directly to presigned URLs (not through proxy)
4. **Clean up** old artifacts to reduce storage costs

### Error Handling

1. **Enable Continue on Fail** for non-critical operations
2. **Implement retry logic** for transient failures (5xx errors)
3. **Log errors** with context for debugging
4. **Check health** before starting critical workflows

---

## Support

For API issues or questions:
- **Documentation**: See main [README.md](../README.md)
- **OpenAPI Spec**: See [openapi.json](./openapi.json)
- **Examples**: See [EXAMPLES.md](./EXAMPLES.md)
- **Troubleshooting**: See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

---

**Last Updated:** 2025-12-03
**API Version:** 1.0.0
