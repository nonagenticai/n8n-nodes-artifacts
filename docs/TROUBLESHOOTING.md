# Artifacts Node - Troubleshooting Guide

Common issues, solutions, and debugging tips for the n8n Artifacts node.

---

## Table of Contents

1. [Authentication Issues](#authentication-issues)
2. [Upload Problems](#upload-problems)
3. [Download Issues](#download-issues)
4. [Query and Filter Problems](#query-and-filter-problems)
5. [Performance Issues](#performance-issues)
6. [Configuration Errors](#configuration-errors)
7. [Network and Connectivity](#network-and-connectivity)
8. [Data Validation Errors](#data-validation-errors)
9. [Debugging Tips](#debugging-tips)
10. [Getting Help](#getting-help)

---

## Authentication Issues

### Issue: "Authentication failed: Invalid API key"

**Symptoms:**
- Error 401 Unauthorized
- Message: "Invalid API key or bearer token"

**Causes:**
- Incorrect API key in credentials
- API key has been revoked or expired
- Wrong authentication method selected

**Solutions:**

1. **Verify API key:**
   ```bash
   # Test API key with curl
   curl -H "Authorization: Bearer <token>" \
     https://artifacts.example.com/health
   ```

2. **Check credentials configuration:**
   - Go to n8n Credentials → Artifacts API
   - Verify API key is correct (no extra spaces)
   - Test the credential using the "Test" button

3. **Regenerate API key:**
   - If key is old or potentially compromised
   - Update credential with new key
   - Test again

4. **Check authentication method:**
   - Ensure "authMethod" is set correctly
   - For API key: Select "API Key (Legacy)"
   - For OAuth2: Select "Keycloak (OAuth2 Client Credentials)"

### Issue: "Keycloak authentication failed"

**Symptoms:**
- Error: "Cannot connect to Keycloak server"
- Error: "Invalid client credentials"

**Causes:**
- Incorrect Keycloak URL
- Wrong realm name
- Invalid client ID or secret
- Keycloak server is down

**Solutions:**

1. **Verify Keycloak configuration:**
   ```javascript
   // Check these fields in credentials:
   Keycloak URL: https://keycloak.example.com (with https://)
   Realm: secure-apps (exact match)
   Client ID: artifacts (case-sensitive)
   Client Secret: ******** (no spaces)
   ```

2. **Test Keycloak connectivity:**
   ```bash
   # Check realm endpoint
   curl https://keycloak.example.com/realms/my-realm

   # Test token endpoint
   curl -X POST https://keycloak.example.com/realms/my-realm/protocol/openid-connect/token \
     -d "grant_type=client_credentials" \
     -d "client_id=artifacts" \
     -d "client_secret=YOUR_SECRET"
   ```

3. **Check ServiceAuthenticator logs:**
   ```javascript
   // Enable debug logging in n8n
   // Check n8n logs for detailed error messages
   ```

4. **Verify SSL certificates:**
   - If using self-signed certificates:
     - Enable "Ignore SSL Issues" in credentials (development only)
     - Or provide CA certificate path

### Issue: "Token expired" or "Token invalid"

**Symptoms:**
- Works initially, then fails
- Error: "Token has expired"

**Causes:**
- ServiceAuthenticator cache issue
- Long-running workflow exceeds token lifetime

**Solutions:**

1. **Token is auto-refreshed:**
   - ServiceAuthenticator refreshes tokens 60s before expiry
   - No manual action needed in most cases

2. **For very long workflows:**
   - Split into multiple shorter workflows
   - Or force token refresh by re-executing the node

3. **Clear credential cache:**
   - Save the credential again
   - This resets the ServiceAuthenticator instance

---

## Upload Problems

### Issue: "Upload URL expired"

**Symptoms:**
- Error: "Request has expired" when uploading to presigned URL
- HTTP 403 Forbidden on PUT request

**Causes:**
- Took too long between Sign Upload and actual file upload
- URL expires after `expires_in_seconds` (typically 3600 seconds = 1 hour)

**Solutions:**

1. **Reduce time between steps:**
   - Minimize processing between Sign Upload and HTTP Upload
   - Move heavy processing to after upload

2. **Check expiration time:**
   ```javascript
   // In response from Sign Upload
   const expiresIn = $json.expires_in_seconds; // e.g., 3600
   // Upload must complete within this time
   ```

3. **Request new presigned URL:**
   - Call Sign Upload again to get a fresh URL
   - Use the new URL for upload

### Issue: "SHA256 checksum mismatch"

**Symptoms:**
- Error during Finalize Upload: "Checksum does not match uploaded file"
- HTTP 400 Bad Request

**Causes:**
- File was modified during upload
- Incorrect checksum calculation
- Checksum in wrong format (uppercase instead of lowercase)

**Solutions:**

1. **Verify checksum calculation:**
   ```javascript
   // Correct method:
   const crypto = require('crypto');
   const hash = crypto.createHash('sha256')
     .update(fileData)
     .digest('hex')    // hex format
     .toLowerCase();   // must be lowercase

   // Common mistake:
   .digest('base64')  // WRONG - must be hex
   ```

2. **Use openssl for verification:**
   ```bash
   # Calculate SHA256 of file
   openssl dgst -sha256 file.pdf
   # Output: SHA256(file.pdf)= a3c5f7e9...

   # Ensure it matches what you send to Finalize
   ```

3. **Check file integrity:**
   - Ensure file wasn't modified between upload and finalize
   - Use the exact same file data for both operations

4. **Format requirements:**
   - Must be exactly 64 characters
   - Must be lowercase hexadecimal
   - No spaces, no prefix (like "0x")

### Issue: "File size mismatch"

**Symptoms:**
- Error: "Size does not match uploaded file"
- Finalize Upload fails with 400 error

**Causes:**
- Incorrect size calculation
- File was compressed/decompressed
- Using string length instead of byte length

**Solutions:**

1. **Calculate size correctly:**
   ```javascript
   // For binary data:
   const size = Buffer.byteLength(fileData);

   // For string data (like CSV):
   const size = Buffer.byteLength(csvString, 'utf8');

   // NOT this (wrong for multi-byte characters):
   const size = csvString.length; // WRONG
   ```

2. **Match uploaded file exactly:**
   - Use same data for upload and size calculation
   - Don't transform after calculating size

### Issue: "Invalid artifact token"

**Symptoms:**
- Error: "Artifact token is invalid or expired"
- Finalize fails with 404 or 400

**Causes:**
- Token already used (tokens are single-use)
- Token expired
- Token is from different Sign Upload request
- Typo in token

**Solutions:**

1. **Use token only once:**
   - Each Sign Upload creates a unique token
   - Token is consumed when Finalize succeeds
   - Can't reuse token for multiple files

2. **Match token to upload:**
   - Use token from the same Sign Upload request
   - Don't mix tokens from different uploads

3. **Check token format:**
   ```javascript
   // Token should be a long string like:
   "example-artifact-token"

   // Verify no truncation or corruption:
   console.log(`Token length: ${token.length}`);
   ```

### Issue: "Filename contains path separators"

**Symptoms:**
- Error: "Filename cannot contain path separators"
- Sign Upload fails with 400 error

**Causes:**
- Filename has `/`, `\`, or `..` characters
- Using full file path instead of just filename

**Solutions:**

1. **Extract filename only:**
   ```javascript
   // From full path:
   const fullPath = "/uploads/reports/file.pdf";
   const filename = fullPath.split('/').pop(); // "file.pdf"

   // Or use path module:
   const path = require('path');
   const filename = path.basename(fullPath);
   ```

2. **Remove invalid characters:**
   ```javascript
   const cleanFilename = filename
     .replace(/[\/\\]/g, '-')  // Replace slashes
     .replace(/\.\./g, '');     // Remove ".."
   ```

3. **Validate before upload:**
   ```javascript
   function validateFilename(name) {
     if (name.includes('/') || name.includes('\\') || name.includes('..')) {
       throw new Error('Invalid filename');
     }
     if (name.length < 1 || name.length > 255) {
       throw new Error('Filename must be 1-255 characters');
     }
     return true;
   }
   ```

---

## Download Issues

### Issue: "Artifact not found" when downloading

**Symptoms:**
- Error 404: Artifact not found
- Can't download recently uploaded artifact

**Causes:**
- Incorrect artifact ID
- Artifact was deleted
- Wrong project ID
- No permission to access artifact

**Solutions:**

1. **Verify artifact ID:**
   ```javascript
   // List artifacts to find correct ID
   Operation: List Artifacts
   Project ID: {{$env.PROJECT_ID}}

   // Then use ID from list results:
   Artifact ID: {{$json.id}}
   ```

2. **Check artifact exists:**
   ```javascript
   // Use Get Artifact first
   Operation: Get Artifact
   Project ID: {{$env.PROJECT_ID}}
   Artifact ID: {{$json.artifact_id}}

   // Then download
   Operation: Download Artifact
   // ... use same IDs
   ```

3. **Verify project ID:**
   - Ensure same project ID used for upload and download
   - Check environment variables/credentials

### Issue: "Download URL expired"

**Symptoms:**
- URL works initially but then returns 403
- "Request has expired" error

**Causes:**
- Download URL expired (typically 1 hour)
- Trying to reuse old URL

**Solutions:**

1. **Get fresh download URL:**
   ```javascript
   // Call Download Artifact again
   Operation: Download Artifact
   // This generates a new URL
   ```

2. **Download immediately:**
   - Don't store download URLs for later use
   - Generate URL right before downloading

3. **Check expiration:**
   ```javascript
   const expiresIn = $node["Download Artifact"].json.expires_in;
   // Download within this many seconds
   ```

---

## Query and Filter Problems

### Issue: "No results when filtering by tags"

**Symptoms:**
- List Artifacts returns empty array
- Know artifacts exist with those tags

**Causes:**
- Tag filter requires ALL tags to match (AND operation)
- Tag names are case-sensitive or have typos
- Tags weren't set during upload

**Solutions:**

1. **Understand tag filtering:**
   ```javascript
   // Filters for artifacts with ALL these tags:
   Tags: ["finance", "quarterly"]
   // Returns only artifacts having BOTH tags

   // To search for artifacts with ANY tag, use separate queries
   ```

2. **Verify tags exist:**
   ```javascript
   // List without filters first
   Operation: List Artifacts
   Project ID: {{$env.PROJECT_ID}}
   // No filters

   // Check what tags artifacts actually have:
   artifacts.forEach(a => console.log(a.tags));
   ```

3. **Check tag case:**
   ```javascript
   // Tags are case-sensitive:
   "Finance" !== "finance"

   // Normalize tags:
   tags: tags.map(t => t.toLowerCase())
   ```

### Issue: "Filtering by card and step returns nothing"

**Symptoms:**
- Can't filter by both card_id and step
- Error: "Mutually exclusive fields"

**Causes:**
- An artifact can have EITHER card_id OR step, not both
- Trying to filter by both

**Solutions:**

1. **Use one or the other:**
   ```javascript
   // Option 1: Filter by card
   Filter Card ID: 123e4567-...
   Filter Step: (leave empty)

   // Option 2: Filter by step
   Filter Card ID: (leave empty)
   Filter Step: QA:validation
   ```

2. **Query separately if needed:**
   ```javascript
   // First query: By card
   Operation: List Artifacts
   Filter Card ID: {{$json.card_id}}

   // Second query: By step
   Operation: List Artifacts
   Filter Step: {{$json.step}}

   // Merge results in Code node
   ```

---

## Performance Issues

### Issue: "List operation is slow"

**Symptoms:**
- List Artifacts takes a long time
- Timeout errors on large projects

**Causes:**
- Too many artifacts in project
- No pagination (fetching all at once)
- Database query timeout

**Solutions:**

1. **Use pagination:**
   ```javascript
   // First page:
   Limit: 100
   Offset: 0

   // Second page:
   Limit: 100
   Offset: 100

   // Continue until results < limit
   ```

2. **Add filters:**
   ```javascript
   // Narrow results with filters:
   Filter Kind: doc
   Filter Step: QA:validation
   Limit: 50
   ```

3. **Use manifests for aggregates:**
   ```javascript
   // Instead of listing all to count:
   Operation: Get Manifest
   Scope: project

   // Returns total_count without fetching all artifacts
   ```

### Issue: "Upload is very slow"

**Symptoms:**
- Upload takes much longer than expected
- Timeout during file upload step

**Causes:**
- Large file size
- Slow network connection
- MinIO server performance

**Solutions:**

1. **Check file size:**
   ```javascript
   const sizeMB = fileSize / (1024 * 1024);
   console.log(`Uploading ${sizeMB.toFixed(2)} MB`);

   // Expect ~1-5 MB/sec depending on network
   ```

2. **Increase timeout:**
   ```javascript
   // In HTTP Request node (for upload):
   Timeout: 300000 // 5 minutes for large files
   ```

3. **Compress before upload:**
   ```javascript
   // For datasets or text files:
   const zlib = require('zlib');
   const compressed = zlib.gzipSync(fileData);

   // Upload compressed file
   // Update content_type to application/gzip
   ```

---

## Configuration Errors

### Issue: "Missing required field" errors

**Symptoms:**
- Error 422: Validation error
- "field required" in error detail

**Causes:**
- Required field not provided
- Field is empty string or null
- Field name typo

**Solutions:**

1. **Check required fields:**
   ```javascript
   // Sign Upload requires:
   - filename (non-empty string)
   - content_type (non-empty string)
   - kind (one of the enum values)
   - project_id (valid UUID)

   // Finalize Upload requires:
   - artifact_token (from Sign Upload)
   - size (positive integer)
   - sha256 (64 hex characters)
   ```

2. **Validate before calling:**
   ```javascript
   // Add validation node before operation:
   if (!filename || filename.length === 0) {
     throw new Error('Filename is required');
   }
   if (!projectId || !projectId.match(/^[0-9a-f-]{36}$/)) {
     throw new Error('Invalid project ID format');
   }
   ```

### Issue: "Invalid content type"

**Symptoms:**
- Upload succeeds but file can't be opened
- Wrong MIME type in artifact metadata

**Causes:**
- Incorrect MIME type specified
- Generic "application/octet-stream" used

**Solutions:**

1. **Use correct MIME types:**
   ```javascript
   // Common MIME types:
   PDF: 'application/pdf'
   CSV: 'text/csv'
   JSON: 'application/json'
   PNG: 'image/png'
   JPEG: 'image/jpeg'
   Excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
   Word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
   ```

2. **Detect from file:**
   ```javascript
   // Use file-type package:
   const FileType = require('file-type');
   const type = await FileType.fromBuffer(fileData);
   const contentType = type ? type.mime : 'application/octet-stream';
   ```

3. **Map file extensions:**
   ```javascript
   const mimeTypes = {
     '.pdf': 'application/pdf',
     '.csv': 'text/csv',
     '.json': 'application/json',
     '.png': 'image/png',
     '.jpg': 'image/jpeg',
     '.jpeg': 'image/jpeg'
   };

   const ext = filename.substring(filename.lastIndexOf('.'));
   const contentType = mimeTypes[ext] || 'application/octet-stream';
   ```

---

## Network and Connectivity

### Issue: "Connection timeout" or "ECONNREFUSED"

**Symptoms:**
- Can't connect to Artifacts API
- Error: "ECONNREFUSED" or "ETIMEDOUT"

**Causes:**
- Incorrect base URL
- Service is down
- Network/firewall issue
- DNS resolution failure

**Solutions:**

1. **Verify base URL:**
   ```bash
   # Test connectivity:
   curl https://artifacts.example.com/health

   # Check DNS:
   nslookup artifacts.example.com

   # Test from n8n server:
   docker exec n8n curl https://artifacts.example.com/health
   ```

2. **Check service status:**
   ```javascript
   // Use Health Check operation:
   Operation: Health Check

   // If fails, service may be down
   // Check with ops team
   ```

3. **Verify network access:**
   - Check firewall rules
   - Ensure n8n can reach the API
   - Check Docker network configuration

4. **Update credentials:**
   ```javascript
   // In Artifacts API credentials:
   Service Base URL: https://artifacts.example.com
   // Ensure correct protocol (https vs http)
   // Ensure no trailing slash
   ```

### Issue: "SSL certificate error"

**Symptoms:**
- Error: "self signed certificate"
- "unable to verify the first certificate"

**Causes:**
- Using self-signed SSL certificates
- Missing CA certificate
- Certificate verification failure

**Solutions:**

1. **For development (NOT production):**
   ```javascript
   // In Artifacts API credentials:
   SSL Certificate Options → Ignore SSL Issues: true
   ```

2. **For production (recommended):**
   ```javascript
   // In credentials:
   SSL Certificate Options → CA Certificate Path: /path/to/ca-cert.pem

   // Or install CA cert in system trust store
   ```

3. **Use proper certificates:**
   - Get certificates from trusted CA
   - Don't use self-signed in production

---

## Data Validation Errors

### Issue: "Invalid UUID format"

**Symptoms:**
- Error: "value is not a valid uuid"
- 422 Validation error

**Causes:**
- Project ID or artifact ID is not a valid UUID
- Wrong format or typo

**Solutions:**

1. **UUID format:**
   ```javascript
   // Valid UUID format:
   "123e4567-e89b-12d3-a456-426614174000"
   // 8-4-4-4-12 hexadecimal digits

   // Validate UUID:
   const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
   if (!uuidRegex.test(projectId)) {
     throw new Error('Invalid UUID format');
   }
   ```

2. **Get correct UUID:**
   ```javascript
   // Don't hardcode UUIDs
   // Get from environment or previous nodes:
   Project ID: {{$env.PROJECT_ID}}
   Artifact ID: {{$node["Upload"].json.artifact_id}}
   ```

### Issue: "Value too long" or "Value too short"

**Symptoms:**
- Error: "ensure this value has at most N characters"
- String length validation error

**Causes:**
- Field exceeds maximum length
- Empty string where not allowed

**Solutions:**

1. **Check field limits:**
   ```javascript
   // Field length limits:
   filename: 1-255 characters
   step: max 100 characters
   container_name: max 100 characters
   tags: each tag max 50 characters, max 20 tags
   ```

2. **Truncate if needed:**
   ```javascript
   const MAX_FILENAME = 255;
   let filename = originalName;
   if (filename.length > MAX_FILENAME) {
     const ext = filename.substring(filename.lastIndexOf('.'));
     const base = filename.substring(0, MAX_FILENAME - ext.length);
     filename = base + ext;
   }
   ```

---

## Debugging Tips

### Enable Verbose Logging

```javascript
// In n8n node:
// Add Code node before operation to log details:
console.log('Project ID:', projectId);
console.log('Artifact ID:', artifactId);
console.log('Filename:', filename);
console.log('Content Type:', contentType);

// Return data unchanged:
return $input.all();
```

### Inspect API Responses

```javascript
// Add Code node after operation:
const response = $input.first().json;
console.log('Full response:', JSON.stringify(response, null, 2));

// Check for error fields:
if (response.error) {
  console.error('Error:', response.error);
}

return { json: response };
```

### Test with Curl

```bash
# Sign Upload:
curl -X POST https://artifacts.example.com/projects/PROJECT_ID/artifacts/sign-upload \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.pdf",
    "content_type": "application/pdf",
    "kind": "doc"
  }'

# Health Check:
curl https://artifacts.example.com/health \
  -H "Authorization: Bearer $API_KEY"

# List Artifacts:
curl https://artifacts.example.com/projects/PROJECT_ID/artifacts?limit=10 \
  -H "Authorization: Bearer $API_KEY"
```

### Check n8n Logs

```bash
# If running in Docker:
docker logs n8n --tail 100 --follow

# Look for:
# - Authentication errors
# - Network errors
# - Request/response details
```

### Use Try-Catch Pattern

```javascript
// Code node with error handling:
try {
  // Your operation logic
  const result = await someOperation();
  return { json: result };
} catch (error) {
  console.error('Operation failed:', error.message);
  console.error('Stack trace:', error.stack);

  // Return error details for debugging:
  return {
    json: {
      error: true,
      message: error.message,
      details: error
    }
  };
}
```

---

## Getting Help

### Before Asking for Help

1. **Check this troubleshooting guide** - Most common issues are covered here
2. **Review API Reference** - See [API_REFERENCE.md](./API_REFERENCE.md)
3. **Check examples** - See [EXAMPLES.md](./EXAMPLES.md)
4. **Test with curl** - Isolate if issue is with n8n or API
5. **Check service status** - Use Health Check operation

### Information to Provide

When reporting issues, include:

1. **Error message** - Full error text and status code
2. **Node configuration** - Operation and parameters used
3. **Workflow structure** - Which nodes are involved
4. **n8n version** - Check in n8n settings
5. **API version** - From Health Check response
6. **Reproducible steps** - How to reproduce the issue
7. **Expected vs actual behavior**

### Support Channels

- **Documentation**: See [README.md](../README.md)
- **API Reference**: [API_REFERENCE.md](./API_REFERENCE.md)
- **Examples**: [EXAMPLES.md](./EXAMPLES.md)
- **OpenAPI Spec**: [openapi.json](./openapi.json)

---

## Common Error Codes Quick Reference

| Code | Error | Quick Fix |
|------|-------|-----------|
| 400 | Bad Request | Check parameter formats and values |
| 401 | Unauthorized | Verify API key/credentials |
| 403 | Forbidden | Check permissions and URL expiry |
| 404 | Not Found | Verify IDs exist and are correct |
| 422 | Validation Error | Check required fields and formats |
| 500 | Server Error | Retry after a few minutes |
| 503 | Service Unavailable | Check service health, contact ops |

---

**Last Updated:** 2025-12-03
**Node Version:** 1.0.0
