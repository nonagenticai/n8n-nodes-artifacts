# Artifacts Node - Usage Examples

Real-world examples and workflows for the n8n Artifacts node.

---

## Table of Contents

1. [Basic Upload Workflow](#basic-upload-workflow)
2. [Complete Upload with HTTP Request](#complete-upload-with-http-request)
3. [List and Filter Artifacts](#list-and-filter-artifacts)
4. [Download and Process Artifacts](#download-and-process-artifacts)
5. [Batch Operations](#batch-operations)
6. [Manifests and Reporting](#manifests-and-reporting)
7. [Error Handling Patterns](#error-handling-patterns)
8. [Security Best Practices](#security-best-practices)
9. [Advanced Workflows](#advanced-workflows)

---

## Basic Upload Workflow

### Scenario: Upload a PDF Report

Simple workflow to upload a PDF document to the Artifacts Registry.

#### Workflow Nodes

```
1. [Schedule Trigger] → Daily at 9 AM
2. [Generate Report] → Create PDF report
3. [Artifacts: Sign Upload] → Get presigned URL
4. [HTTP Request: Upload File] → PUT file to MinIO
5. [Calculate SHA256] → Compute checksum
6. [Artifacts: Finalize Upload] → Complete registration
7. [Send Email] → Notify user with artifact ID
```

#### Node Configurations

**Node 3: Artifacts - Sign Upload**
```javascript
Operation: Sign Upload
Project ID: 3f2e4d5c-6a7b-8c9d-0e1f-2a3b4c5d6e7f
Filename: {{$now.format("yyyy-MM-dd")}}-daily-report.pdf
Content Type: application/pdf
Kind: doc
Sensitivity: internal
Tags: ["daily-report", "automated"]
```

**Node 4: HTTP Request - Upload File**
```javascript
Method: PUT
URL: {{$node["Artifacts: Sign Upload"].json.upload_url}}
Headers:
  Content-Type: application/pdf
Body: Binary Data
Binary Data: {{$node["Generate Report"].binary.data}}
```

**Node 5: Calculate SHA256**
```javascript
// Using Code node
const crypto = require('crypto');
const fileData = $node["Generate Report"].binary.data;
const hash = crypto.createHash('sha256').update(fileData).digest('hex');
return { sha256: hash, size: fileData.length };
```

**Node 6: Artifacts - Finalize Upload**
```javascript
Operation: Finalize Upload
Project ID: 3f2e4d5c-6a7b-8c9d-0e1f-2a3b4c5d6e7f
Artifact Token: {{$node["Artifacts: Sign Upload"].json.artifact_token}}
Size: {{$node["Calculate SHA256"].json.size}}
SHA256: {{$node["Calculate SHA256"].json.sha256}}
```

**Node 7: Send Email**
```javascript
To: team@company.com
Subject: Daily Report Uploaded
Body:
  Report uploaded successfully!
  Artifact ID: {{$node["Artifacts: Finalize Upload"].json.artifact_id}}
  Filename: {{$node["Artifacts: Sign Upload"].json.filename}}
  Size: {{$node["Calculate SHA256"].json.size}} bytes
```

---

## Complete Upload with HTTP Request

### Scenario: Upload CSV Dataset from External API

Download data from an external API, convert to CSV, and upload to Artifacts.

#### Workflow Nodes

```
1. [HTTP Request] → Fetch data from API
2. [Code] → Convert JSON to CSV
3. [Artifacts: Sign Upload] → Get upload URL
4. [HTTP Request] → Upload CSV file
5. [Code] → Calculate SHA256 checksum
6. [Artifacts: Finalize Upload] → Register artifact
```

#### Detailed Example

**Node 1: Fetch Data**
```javascript
Method: GET
URL: https://api.example.com/data/export
Authentication: Bearer Token
```

**Node 2: Convert to CSV**
```javascript
// Code node
const items = $input.all();
const data = items.map(item => item.json);

// Convert to CSV
const headers = Object.keys(data[0]);
const csvRows = [headers.join(',')];
data.forEach(row => {
  const values = headers.map(header => JSON.stringify(row[header]));
  csvRows.push(values.join(','));
});
const csv = csvRows.join('\n');

return {
  json: { csv, filename: `export-${new Date().toISOString()}.csv` }
};
```

**Node 3: Sign Upload**
```javascript
Operation: Sign Upload
Project ID: {{$env.PROJECT_ID}}
Filename: {{$node["Convert to CSV"].json.filename}}
Content Type: text/csv
Kind: dataset
Card ID: {{$node["Get Active Card"].json.id}}
Sensitivity: internal
Tags: ["api-export", "automated"]
```

**Node 4: Upload CSV**
```javascript
Method: PUT
URL: {{$node["Artifacts: Sign Upload"].json.upload_url}}
Headers:
  Content-Type: text/csv
Body: {{$node["Convert to CSV"].json.csv}}
```

**Node 5: Calculate Checksum**
```javascript
// Code node
const crypto = require('crypto');
const csv = $node["Convert to CSV"].json.csv;
const hash = crypto.createHash('sha256').update(csv).digest('hex');
const size = Buffer.byteLength(csv, 'utf8');

return { json: { sha256: hash, size } };
```

**Node 6: Finalize**
```javascript
Operation: Finalize Upload
Project ID: {{$env.PROJECT_ID}}
Artifact Token: {{$node["Artifacts: Sign Upload"].json.artifact_token}}
Size: {{$node["Calculate Checksum"].json.size}}
SHA256: {{$node["Calculate Checksum"].json.sha256}}
```

---

## List and Filter Artifacts

### Scenario: Find All Secret Documents from QA Step

Query artifacts with specific filters and process results.

#### Workflow Example

**Node: List Artifacts with Filters**
```javascript
Operation: List Artifacts
Project ID: 3f2e4d5c-6a7b-8c9d-0e1f-2a3b4c5d6e7f
Kind: doc
Step: QA:validation
Sensitivity: secret
Limit: 100
Offset: 0
```

**Result Processing**
```javascript
// Code node - Process list results
const artifacts = $input.all();

// Group by date
const byDate = artifacts.reduce((acc, item) => {
  const date = new Date(item.json.created_at).toDateString();
  if (!acc[date]) acc[date] = [];
  acc[date].push(item.json);
  return acc;
}, {});

// Calculate statistics
const stats = {
  total: artifacts.length,
  totalSize: artifacts.reduce((sum, item) => sum + item.json.size, 0),
  byDate: Object.keys(byDate).map(date => ({
    date,
    count: byDate[date].length,
    size: byDate[date].reduce((sum, a) => sum + a.size, 0)
  }))
};

return { json: stats };
```

### Scenario: Pagination Through Large Collections

Handle large result sets with pagination.

```javascript
// Workflow with loop
// Node 1: Set Variables
const PAGE_SIZE = 50;
let allArtifacts = [];
let offset = 0;
let hasMore = true;

return { json: { pageSize: PAGE_SIZE, offset: 0, hasMore: true, results: [] } };

// Node 2: List Artifacts (inside loop)
Operation: List Artifacts
Project ID: {{$env.PROJECT_ID}}
Limit: {{$node["Set Variables"].json.pageSize}}
Offset: {{$node["Set Variables"].json.offset}}

// Node 3: Check If More Pages
// Code node
const items = $input.all();
const hasMore = items.length === $node["Set Variables"].json.pageSize;
const nextOffset = $node["Set Variables"].json.offset + items.length;

// Accumulate results
const allResults = [
  ...$node["Set Variables"].json.results,
  ...items.map(i => i.json)
];

return {
  json: {
    pageSize: $node["Set Variables"].json.pageSize,
    offset: nextOffset,
    hasMore: hasMore,
    results: allResults
  }
};

// Loop back to Node 2 if hasMore === true
```

---

## Download and Process Artifacts

### Scenario: Download and Email PDF Reports

Download artifacts and send them via email.

#### Workflow Nodes

```
1. [Artifacts: List Artifacts] → Get recent reports
2. [Loop] → Iterate through each artifact
3. [Artifacts: Download Artifact] → Get download URL
4. [HTTP Request] → Download file
5. [Email] → Send file as attachment
```

#### Configuration

**Node 1: List Recent Reports**
```javascript
Operation: List Artifacts
Project ID: {{$env.PROJECT_ID}}
Kind: doc
Tags: ["monthly-report"]
Limit: 10
```

**Node 2: Loop Through Artifacts**
```javascript
// Split In Batches node
Batch Size: 1
```

**Node 3: Get Download URL**
```javascript
Operation: Download Artifact
Project ID: {{$env.PROJECT_ID}}
Artifact ID: {{$json.id}}
```

**Node 4: Download File**
```javascript
Method: GET
URL: {{$node["Artifacts: Download Artifact"].json.download_url}}
Response Format: File
Binary Property: data
```

**Node 5: Email with Attachment**
```javascript
To: {{$json.created_by}}@company.com
Subject: Your Report - {{$json.filename}}
Body: Please find your report attached.
Attachments: Binary: data
```

### Scenario: Download and Archive to S3

Download artifacts and archive them to AWS S3.

```javascript
// Workflow
1. [Schedule] → Monthly on 1st
2. [Artifacts: List Artifacts] → Get all artifacts from last month
3. [Artifacts: Download] → Get download URL
4. [HTTP Request] → Download file
5. [AWS S3] → Upload to archive bucket
6. [Artifacts: Delete] → Remove from Artifacts Registry
7. [Log] → Record archived artifacts
```

---

## Batch Operations

### Scenario: Bulk Upload Multiple Files

Upload multiple files in a batch workflow.

#### Workflow Structure

```
1. [Read Files from Directory] → Get file list
2. [Loop Through Files] → Process each file
3. [Artifacts: Sign Upload] → For each file
4. [HTTP Request: Upload] → Upload to presigned URL
5. [Calculate Checksum] → For each file
6. [Artifacts: Finalize] → Complete each upload
7. [Aggregate Results] → Collect all artifact IDs
```

#### Implementation

**Node 1: Read Files**
```javascript
// Code node - Simulate reading files
const files = [
  { name: 'report1.pdf', data: Buffer.from('...'), contentType: 'application/pdf' },
  { name: 'report2.pdf', data: Buffer.from('...'), contentType: 'application/pdf' },
  { name: 'data.csv', data: Buffer.from('...'), contentType: 'text/csv' }
];

return files.map(file => ({ json: file }));
```

**Node 2-6: Upload Loop**
```javascript
// Same as single upload workflow, but processes each file

// Node 7: Aggregate Results
const results = $input.all();
const summary = {
  total: results.length,
  successful: results.filter(r => r.json.artifact_id).length,
  failed: results.filter(r => r.json.error).length,
  artifacts: results.map(r => ({
    filename: r.json.filename,
    artifactId: r.json.artifact_id,
    size: r.json.size
  }))
};

return { json: summary };
```

### Scenario: Bulk Delete Old Artifacts

Delete artifacts older than a specified date.

```javascript
// Workflow
1. [Set Variables] → Define cutoff date
const cutoffDate = new Date();
cutoffDate.setMonth(cutoffDate.getMonth() - 6); // 6 months ago
return { json: { cutoffDate: cutoffDate.toISOString() } };

2. [Artifacts: List Artifacts] → Get all artifacts
Operation: List Artifacts
Project ID: {{$env.PROJECT_ID}}
Limit: 1000

3. [Filter Old Artifacts] → Code node
const cutoff = new Date($node["Set Variables"].json.cutoffDate);
const items = $input.all();
const oldArtifacts = items.filter(item => {
  return new Date(item.json.created_at) < cutoff;
});
return oldArtifacts;

4. [Loop] → Delete each artifact
Operation: Delete Artifact
Project ID: {{$env.PROJECT_ID}}
Artifact ID: {{$json.id}}

5. [Log Results]
Deleted ${$input.all().length} artifacts older than ${cutoffDate}
```

---

## Manifests and Reporting

### Scenario: Generate Project Artifact Report

Create a comprehensive report of all project artifacts.

#### Workflow

```javascript
// Node 1: Get Project Manifest
Operation: Get Manifest
Project ID: {{$env.PROJECT_ID}}
Scope: project

// Node 2: Get Card Manifests
// Loop through all cards in project
Operation: Get Manifest
Project ID: {{$env.PROJECT_ID}}
Scope: card
Scope Ref: {{$json.card_id}}

// Node 3: Aggregate Data
// Code node
const projectManifest = $node["Get Project Manifest"].json;
const cardManifests = $node["Get Card Manifests"].all();

const report = {
  project: {
    id: projectManifest.project_id,
    totalArtifacts: projectManifest.total_count,
    totalSize: projectManifest.total_size,
    totalSizeMB: (projectManifest.total_size / 1024 / 1024).toFixed(2)
  },
  byKind: projectManifest.kind_breakdown,
  bySensitivity: projectManifest.sensitivity_breakdown,
  byCard: cardManifests.map(cm => ({
    cardId: cm.json.scope_ref,
    count: cm.json.total_count,
    size: cm.json.total_size
  }))
};

return { json: report };

// Node 4: Format as HTML
// Code node
const report = $node["Aggregate Data"].json;
const html = `
<html>
<head><title>Artifact Report</title></head>
<body>
  <h1>Project Artifact Report</h1>
  <h2>Summary</h2>
  <ul>
    <li>Total Artifacts: ${report.project.totalArtifacts}</li>
    <li>Total Size: ${report.project.totalSizeMB} MB</li>
  </ul>

  <h2>By Kind</h2>
  <ul>
    ${Object.entries(report.byKind).map(([kind, count]) =>
      `<li>${kind}: ${count}</li>`
    ).join('')}
  </ul>

  <h2>By Card</h2>
  <table>
    <tr><th>Card ID</th><th>Count</th><th>Size (MB)</th></tr>
    ${report.byCard.map(card => `
      <tr>
        <td>${card.cardId}</td>
        <td>${card.count}</td>
        <td>${(card.size / 1024 / 1024).toFixed(2)}</td>
      </tr>
    `).join('')}
  </table>
</body>
</html>
`;

return { json: { html } };

// Node 5: Send Report Email
To: admin@company.com
Subject: Weekly Artifact Report
Body: HTML
Content: {{$node["Format as HTML"].json.html}}
```

### Scenario: Monitor Storage Usage

Track storage usage and send alerts when limits are exceeded.

```javascript
// Workflow (runs daily)
1. [Artifacts: Get Manifest] → Project scope
2. [Check Storage Limit] → Code node
const manifest = $node["Artifacts: Get Manifest"].json;
const LIMIT_GB = 10;
const currentGB = manifest.total_size / (1024 * 1024 * 1024);
const percentUsed = (currentGB / LIMIT_GB) * 100;

return {
  json: {
    currentGB: currentGB.toFixed(2),
    limitGB: LIMIT_GB,
    percentUsed: percentUsed.toFixed(1),
    alert: percentUsed > 80
  }
};

3. [IF] → Check if alert needed
Condition: {{$node["Check Storage Limit"].json.alert}} === true

4. [Send Alert Email]
To: admin@company.com
Subject: Storage Alert - {{$node["Check Storage Limit"].json.percentUsed}}% Used
Body:
  Storage usage has exceeded 80% of limit.
  Current: {{$node["Check Storage Limit"].json.currentGB}} GB
  Limit: {{$node["Check Storage Limit"].json.limitGB}} GB
  Please review and clean up old artifacts.
```

---

## Error Handling Patterns

### Pattern 1: Retry on Failure

Handle transient failures with retry logic.

```javascript
// Workflow with retry
1. [Artifacts: Sign Upload]
Continue on Fail: true

2. [Check for Error] → IF node
Condition: {{$node["Artifacts: Sign Upload"].json.error}} !== undefined

3. [Wait] → 5 seconds

4. [Retry Sign Upload]
// Same configuration as Node 1

5. [Check Retry Result]
// Code node
const firstAttempt = $node["Artifacts: Sign Upload"].json;
const retryAttempt = $node["Retry Sign Upload"].json;

if (retryAttempt.error) {
  throw new Error(`Upload failed after retry: ${retryAttempt.error}`);
}

return retryAttempt;
```

### Pattern 2: Fallback Operations

Provide alternative operations when primary fails.

```javascript
// Try to get artifact, fall back to list
1. [Artifacts: Get Artifact]
Continue on Fail: true
Artifact ID: {{$json.artifact_id}}

2. [Check Result] → IF node
Condition: {{$node["Artifacts: Get Artifact"].json.error}} !== undefined

3. [Fallback: List Artifacts]
// Search by filename instead
Operation: List Artifacts
Filters: ... based on known metadata

4. [Select First Match]
// Code node
const results = $node["Fallback: List Artifacts"].all();
if (results.length === 0) {
  throw new Error('Artifact not found');
}
return results[0];
```

### Pattern 3: Graceful Degradation

Continue workflow even if artifact operations fail.

```javascript
// Workflow that continues on artifact failures
1. [Generate Data]

2. [Artifacts: Upload] → Try to archive
Continue on Fail: true

3. [Process Data] → Continue regardless

4. [Check Upload Status] → Code node
const uploadResult = $node["Artifacts: Upload"].json;
const success = !uploadResult.error;

// Log but don't fail
console.log(`Artifact upload ${success ? 'succeeded' : 'failed'}`);

// Continue with main workflow
return $node["Process Data"].json;

5. [Next Steps] → Proceed with workflow
```

---

## Security Best Practices

### Example 1: Secure Credential Management

```javascript
// Use environment variables for credentials
// In n8n Settings → Variables
PROJECT_ID: 3f2e4d5c-6a7b-8c9d-0e1f-2a3b4c5d6e7f
ARTIFACTS_API_KEY: stored_in_credentials

// In workflow nodes
Project ID: {{$env.PROJECT_ID}}
// Credentials automatically handled by Artifacts node
```

### Example 2: Checksum Verification

Always verify checksums for data integrity.

```javascript
// After downloading artifact
1. [Artifacts: Get Artifact] → Get metadata including SHA256

2. [Artifacts: Download] → Get file

3. [Verify Checksum] → Code node
const crypto = require('crypto');
const expectedSha = $node["Artifacts: Get Artifact"].json.sha256;
const fileData = $node["Artifacts: Download"].binary.data;
const actualSha = crypto.createHash('sha256').update(fileData).digest('hex');

if (expectedSha !== actualSha) {
  throw new Error('Checksum mismatch - file may be corrupted');
}

return { json: { verified: true } };
```

### Example 3: Sensitivity-Based Processing

Handle artifacts differently based on sensitivity level.

```javascript
// Code node - Route by sensitivity
const artifact = $input.first().json;

switch (artifact.sensitivity) {
  case 'secret':
    // Encrypt before processing
    // Limit access
    // Audit all operations
    return { json: { ...artifact, route: 'secure' } };

  case 'internal':
    // Standard processing
    return { json: { ...artifact, route: 'standard' } };

  case 'public':
    // Can be cached, shared
    return { json: { ...artifact, route: 'public' } };

  default:
    throw new Error('Unknown sensitivity level');
}

// Use Switch node to route to different processing branches
```

---

## Advanced Workflows

### Workflow 1: Automated Report Generation Pipeline

Complete pipeline for generating, uploading, and distributing reports.

```
[Schedule: Daily 6 AM]
  ↓
[Query Database] → Get data
  ↓
[Transform Data] → Format for report
  ↓
[Generate PDF] → Create report
  ↓
[Artifacts: Health Check] → Verify service
  ↓
[Artifacts: Sign Upload] → Get upload URL
  ↓
[Calculate Checksum] → SHA256 + size
  ↓
[HTTP: Upload] → PUT to MinIO
  ↓
[Artifacts: Finalize] → Register artifact
  ↓
[Get Download URL] → For distribution
  ↓
[Email Team] → Send download link
  ↓
[Update Dashboard] → Log completion
```

### Workflow 2: Artifact Lifecycle Management

Manage artifacts through their lifecycle.

```
[Artifacts: List All]
  ↓
[Classify by Age] → Code: Group by age ranges
  ↓
[Split Into Routes]
  ├─ [<30 days] → Keep
  ├─ [30-90 days] → Tag as "archive-candidate"
  ├─ [90-180 days] → Move to cold storage
  └─ [>180 days] → Delete

[Tag Operation]
  → Update metadata (future enhancement)

[Archive to S3]
  ├─ [Download Artifact]
  ├─ [Upload to S3]
  └─ [Delete from Artifacts]

[Delete Operation]
  ├─ [Create Deletion Record]
  ├─ [Artifacts: Delete]
  └─ [Audit Log]
```

### Workflow 3: Multi-Service Integration

Integrate Artifacts with multiple external services.

```
[Webhook Trigger] → Receive upload request
  ↓
[Validate Input] → Check parameters
  ↓
[Artifacts: Upload] → 3-step process
  ↓
[Slack: Notify] → "#artifacts uploaded"
  ↓
[Update Jira] → Add artifact link to ticket
  ↓
[Update Database] → Log artifact metadata
  ↓
[Trigger Analytics] → Process artifact
  ↓
[Webhook Response] → Return artifact ID
```

---

## Tips and Tricks

### Tip 1: Reusable Upload Function

Create a reusable subworkflow for uploads.

```javascript
// Subworkflow: "Upload Artifact"
// Inputs: filename, fileData, contentType, projectId, kind
// Outputs: artifactId, storageKey

// Can be called from multiple parent workflows
// Centralizes upload logic
// Easier to maintain and update
```

### Tip 2: Batch Processing with Rate Limiting

Process large batches without overwhelming the API.

```javascript
// Use "Split In Batches" with delays
Split In Batches: 10 items per batch
  ↓
[Process Batch]
  ↓
[Wait] → 2 seconds between batches
  ↓
Loop until complete
```

### Tip 3: Metadata Enrichment

Add custom metadata to artifacts via tags.

```javascript
// Encode metadata in tags
Tags: [
  "type:report",
  "year:2024",
  "quarter:Q4",
  "department:finance",
  "auto-generated:true"
]

// Later query by metadata
Filter Tags: ["type:report", "year:2024"]
```

### Tip 4: Conditional Uploads

Upload only when conditions are met.

```javascript
// IF node before upload
Condition: {{$json.fileSize}} > 1024 && {{$json.hasChanges}} === true

// Only upload if file is >1KB and has changes
```

---

## Common Patterns Summary

| Pattern | Use Case | Complexity |
|---------|----------|------------|
| Simple Upload | Single file, no processing | Low |
| Batch Upload | Multiple files | Medium |
| Upload with Processing | Transform before upload | Medium |
| Download and Process | Retrieve and use artifacts | Low |
| Scheduled Reports | Automated reporting | Medium |
| Lifecycle Management | Archive/delete old artifacts | High |
| Error Handling | Robust workflows | Medium |
| Multi-Service Integration | Complex pipelines | High |

---

**Last Updated:** 2025-12-03
**Node Version:** 1.0.0
