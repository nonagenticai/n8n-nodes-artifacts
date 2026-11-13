import type {
  ICredentialDataDecryptedObject,
  ICredentialTestRequest,
  ICredentialType,
  IHttpRequestOptions,
  INodeProperties,
} from "n8n-workflow";

/**
 * Service URL resolution.
 *
 * ⛔ THE CREDENTIAL IS THE HOME FOR THE URL (George, 2026-11-06). A user running
 * this node on their OWN n8n instance sets "Base URL" in the credential and
 * needs nothing else — no env var, no cluster-specific configuration. That is
 * what makes the package usable outside our estate.
 *
 * The env var exported here is the DEPLOYMENT DEFAULT: an operator supplies it
 * once per instance so individual credentials can stay empty. It is a fallback,
 * never an override — the credential always wins.
 *
 * ⚠️ Precedence is only safe if a disagreement is VISIBLE, and it was not.
 * Measured 2026-11-06: one credential still held a public `artifacts.example.com`
 * host while the deployment env named the in-cluster Service. The credential
 * silently won for months, every call left the cluster, and the ingress edge
 * stripped the identity headers it carried. `resolveBaseUrl()` below now warns,
 * naming both values, on the execution that hits the drift.
 */
export const ARTIFACTS_API_URL = process.env.ARTIFACTS_API_URL || "";

/**
 * Resolve the service base URL for one execution.
 *
 * The credential's Base URL wins; the `ARTIFACTS_API_URL` env var is the
 * deployment default used when the credential leaves it empty.
 *
 * ⛔ A disagreement is WARNED, naming both values, rather than silently
 * resolved. That warning is the whole point: a credential holding a stale or
 * public URL used to beat the deployment env with no signal anywhere.
 *
 * @throws Error when NEITHER is set — an empty base URL otherwise turns into a
 * relative request and an unattributable transport error at call time.
 */
export function resolveBaseUrl(
  credentialBaseUrl: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromCredential = String(credentialBaseUrl ?? "").trim();
  const fromEnv = String(env.ARTIFACTS_API_URL ?? "").trim();
  if (fromCredential && fromEnv && fromCredential !== fromEnv) {
    console.warn(
      `[@nonagentic/n8n-nodes-artifacts] Base URL mismatch: credential="${fromCredential}" ` +
        `ARTIFACTS_API_URL="${fromEnv}". The credential wins — clear it to let the ` +
        `deployment env govern.`,
    );
  }
  if (fromCredential) return fromCredential;
  if (fromEnv) return fromEnv;
  throw new Error(
    `[@nonagentic/n8n-nodes-artifacts] No Base URL configured. Set "Base URL" in the credential ` +
      `(this works on any n8n instance), or ARTIFACTS_API_URL in the environment.`,
  );
}

export class ArtifactsApi implements ICredentialType {
  name = "artifactsApi";
  displayName = "Artifacts API";
  icon = "fa:archive" as const;
  documentationUrl = "https://github.com/nonagenticai/artifact_service";

  properties: INodeProperties[] = [
    {
      displayName: "Base URL",
      name: "baseUrl",
      type: "string",
      default: "",
      required: false,
      placeholder: "http://artifacts.example.com",
      description: "Artifacts API base URL. Required for the credential test; node calls fall back to the ARTIFACTS_API_URL process env when empty",
    },
    {
      displayName: "API Token",
      name: "apiToken",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
      description: "Token the service accepts as X-Tenant-Id: Bearer <token>. With auth disabled on a trusted network, any tenant UUID works.",
    },
    {
      displayName: "Tenant ID",
      name: "tenantId",
      type: "string",
      default: "",
      required: false,
      description:
        "Tenant UUID override. Leave EMPTY (default) and the API token is sent as X-Tenant-Id: Bearer <token>, so the service introspects it to the correct tenant. Set this ONLY to pin a specific tenant — it must be a UUID; the service rejects a non-UUID (e.g. a name like 'n8n-dev') with 400.",
    },
  ];

  /**
   * Credential test — DECLARATIVE, against the credential's own `baseUrl`.
   *
   * ⛔ NOT A FUNCTION. n8n never calls a function-valued
   * `ICredentialType.test`: CredentialsTester.getCredentialTestFunction wraps it
   * as `{ testRequest: type.test }` and then routes `testRequest.request` — a
   * property of a function, i.e. `undefined` — so the method body never ran and
   * the UI test could not pass, whatever the URL. (Only a node's
   * `methods.credentialTest` is invoked as a function.)
   *
   * The request runs through `authenticate()` below, so it carries exactly the
   * headers a live call does, and it targets an AUTHENTICATED read: a dead
   * licence is a non-2xx, not a green tick from a public `/health`.
   *
   * No `$env` fallback, deliberately: `$env` is blocked in credentials here
   * (N8N_BLOCK_ENV_ACCESS_IN_NODE), so set `baseUrl` on the credential to test it.
   */
  test: ICredentialTestRequest = {
    request: {
      baseURL: "={{$credentials.baseUrl}}",
      url: "/api/artifacts?limit=1",
      method: "GET",
    },
  };

  async authenticate(
    credentials: ICredentialDataDecryptedObject,
    requestOptions: IHttpRequestOptions,
  ): Promise<IHttpRequestOptions> {
    if (!credentials.apiToken) {
      throw new Error("API token is required");
    }
    if (!requestOptions.headers) {
      requestOptions.headers = {};
    }
    requestOptions.headers["Authorization"] = `Bearer ${credentials.apiToken}`;
    // ⛔ X-Tenant-Id IS THIS SERVICE'S AUTH HEADER: it reads the licence from it only.
    // Configured tenant wins; otherwise the licence. Never absent
    // (services.json licenceAuth "tenant-header-fallback").
    requestOptions.headers["X-Tenant-Id"] = credentials.tenantId
      ? (credentials.tenantId as string)
      : `Bearer ${credentials.apiToken}`;
    return requestOptions;
  }
}
