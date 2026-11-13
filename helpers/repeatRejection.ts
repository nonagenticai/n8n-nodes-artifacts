// ⛔ AUTO-GENERATED — DO NOT EDIT. Verbatim copy of
// n8n_module_scripts/scripts/lib/repeat-rejection.ts, written by
// generate-node.ts. Edit the source there.
/**
 * repeatRejection — a per-execution hard stop for a repeated call that the
 * service already rejected as bad input.
 *
 * ─────────────────────────────── THE DEFECT ────────────────────────────────
 * Proof run 13 (ct.diagram_design.doing, execs 1217065/1217069/1217075/1217080):
 * an AI agent called requirements.validateUmlFragment 38 times per run, every
 * call a 422, 37 of them byte-identical in 1217080. Neither the prompt rule
 * ("never repeat the same call with the same input") nor the flow's post-agent
 * `toolErrorBudget` stops it: at maxIterations the Agent node returns only
 * `{error: "Max iterations…"}` and no intermediateSteps, so the budget never
 * sees a single tool error.
 *
 * ─────────────────────────────── THE STOP ──────────────────────────────────
 * The node remembers, per n8n execution, every call that ended in an
 * input-rejection 4xx. The key is (node name, resource, operation, a stable
 * hash of the RESOLVED node parameters + the item's binary metadata) inside a
 * bucket for the execution id. A call whose key is already remembered is NOT
 * sent:
 *   • as an AI tool  → it returns `terminalToolResult(...)`, the shape the
 *     flows' Collect `toolErrorBudget` treats as an immediate tool_failed
 *     (`terminal: true, reason: "tool_failed"` plus a non-empty string `error`);
 *   • otherwise      → the node class throws a NodeApiError rebuilt from the
 *     remembered fields (same message, httpCode, upstream error code and
 *     `details`), so continueOnFail's error item keeps its error / statusCode /
 *     errorCode / details. The terminal tool result carries `details` too.
 *
 * ANY successful request in the execution — any generated node, any package —
 * forgets that execution's whole memo (`forgetRejections`). Some 4xx are data-
 * state rejections ("need at least 2 principles", a dependency missing lag_days,
 * a cycle, a layer mismatch) that the identical call passes once ANOTHER call
 * has fixed the data. So the stop only cuts BACK-TO-BACK identical failures with
 * no success in between — the run-13 pattern. The memo lives on `globalThis`
 * as `globalThis.__nonagenticRepeatRejectionV1`, so every installed @nonagentic package shares it.
 *
 * ⚠️ KNOWN LIMITS
 * 1. It cannot end the agent loop by itself. At maxIterations the
 * Agent node still returns no intermediateSteps, so the flow's toolErrorBudget
 * never sees the terminal result either. What this buys is that the repeats are
 * no longer SENT, and the model gets a terminal instruction to change the input
 * or stop; whether it stops is still up to the model and maxIterations.
 * 2. Only a success in a REGENERATED node clears the memo. A data fix made
 *    through a hand-written or not-yet-regenerated package (workflows, kanban,
 *    …), a Code or HTTP Request node, or a sub-workflow tool does NOT clear it,
 *    so an identical retry after such a fix stays blocked in that execution.
 * 3. A sub-workflow tool runs under its OWN execution id, so calls made inside
 *    it are a separate memo bucket: the stop does not cover repeats across
 *    separate invocations of a sub-workflow tool.
 *
 * Which statuses are remembered: every 4xx EXCEPT the ones that describe the
 * caller's access, money, rate or the server's/resource's current STATE rather
 * than the input — those can succeed on an identical retry later in the same
 * execution:
 *   401/403/407 auth · 402 billing/BYO-LLM · 429 rate · 408 timeout ·
 *   404 not found yet (poll loops; an agent's own create can make it exist) ·
 *   409/412/423/425/428 conflict / precondition / lock / too early.
 * Never remembered: a 5xx, and a transport failure (no status at all). The
 * memo only sees the FINAL error, after RetryingRequest's own retries
 * (5xx, transient and pre-send network errors) are spent, so it never stands
 * between a request and its retry.
 *
 * Bounds: at most MAX_EXECUTIONS execution buckets (least recently used goes)
 * and MAX_KEYS_PER_EXECUTION keys per bucket (LRU). A different execution id
 * is a different bucket, so nothing crosses executions. No execution id ⇒ no
 * memo. Every function is TOTAL: a failure to build a key means "no key",
 * i.e. the request is sent as before (fail open — this is an optimisation of
 * a loop, never a gate on a first call).
 */
import { createHash } from "crypto";

export const MAX_EXECUTIONS = 32;
export const MAX_KEYS_PER_EXECUTION = 64;
/** Characters of the first error kept in the terminal tool result. */
export const TERMINAL_ERROR_CHARS = 500;

/** 4xx statuses that say nothing about the input itself — never remembered. */
export const NON_INPUT_4XX: ReadonlySet<number> = new Set([401, 402, 403, 404, 407, 408, 409, 412, 423, 425, 428, 429]);

/** True for a status this module remembers: a 4xx that rejects the input. */
export function isInputRejection(status: number | null | undefined): boolean {
  return typeof status === "number" && status >= 400 && status < 500 && !NON_INPUT_4XX.has(status);
}

/** The slice of n8n's IExecuteFunctions this module reads. */
export interface RepeatContext {
  getExecutionId(): string;
  getNode(): { name: string; type: string; parameters: object };
  getNodeParameter(parameterName: string, itemIndex: number, fallbackValue?: any): unknown;
  getInputData(): Array<{ binary?: Record<string, unknown> } | undefined>;
}

/** Characters of the first error's message kept for the non-tool rethrow. */
export const REMEMBERED_MESSAGE_CHARS = 1000;
/** Characters of the upstream error code kept. */
export const REMEMBERED_CODE_CHARS = 200;

/** What is remembered per key — small fields only, never the error object
 *  (request options, headers, response body). */
export interface Rejection {
  status: number;
  /** The first error's message, clipped to REMEMBERED_MESSAGE_CHARS. */
  message: string;
  /** The upstream body's machine-readable code, or null. */
  errorCode: string | null;
  /** The upstream body's `details` string (RM's 422 field paths), clipped to
   *  REMEMBERED_MESSAGE_CHARS, or null. */
  details: string | null;
}

/**
 * The upstream error body's `details` string — `error.details` first, then
 * top-level `details` (the RM envelope; requirements' ValidationDetail reads the
 * same two) — or null. Object bodies only: n8n's request helper puts the parsed
 * JSON body on `.error`; a string body is not parsed here.
 */
export function upstreamDetails(error: unknown): string | null {
  try {
    const e = error as Record<string, any> | null;
    if (!e || typeof e !== "object") return null;
    for (const body of [e.response?.body, e.response?.data, e.body, e.error]) {
      if (!body || typeof body !== "object" || Array.isArray(body)) continue;
      const nested = body.error && typeof body.error === "object" ? body.error.details : undefined;
      const raw = nested ?? body.details;
      if (typeof raw === "string" && raw.trim() !== "") return raw.trim().slice(0, REMEMBERED_MESSAGE_CHARS);
    }
    return null;
  } catch {
    return null;
  }
}

type Memo = Map<string, Map<string, Rejection>>;
// ⛔ Bump the V-suffix whenever the entry shape (Rejection) changes, because packages
// built at different times share this map: an old copy must never read a new entry.
type RegistryHolder = { __nonagenticRepeatRejectionV1?: Memo };

/** One memo per process, shared by every package that ships this helper (a
 *  success in ANY generated node must forget the execution's rejections).
 *  Spelled `(globalThis as …).<name>` because the generator's strict-source scan
 *  refuses any other use of globalThis. */
if (!((globalThis as unknown as RegistryHolder).__nonagenticRepeatRejectionV1 instanceof Map)) {
  (globalThis as unknown as RegistryHolder).__nonagenticRepeatRejectionV1 = new Map();
}
const memo: Memo = (globalThis as unknown as RegistryHolder).__nonagenticRepeatRejectionV1 as Memo;

/** Test hook: forget everything. */
export function resetRepeatRejections(): void {
  memo.clear();
}

/** Number of execution buckets held (tests and bounds checks). */
export function repeatRejectionBuckets(): number {
  return memo.size;
}

/** Deterministic text for a resolved value: object keys sorted, Buffers
 *  hashed, cycles and functions refused (null ⇒ no key ⇒ request is sent). */
function stableText(value: unknown, seen: Set<object>, depth: number): string | null {
  if (depth > 64) return null;
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return JSON.stringify(value);
    case "undefined":
      return "undefined";
    case "bigint":
      return `${String(value)}n`;
    case "object":
      break;
    default:
      return null;
  }
  const obj = value as object;
  if (Buffer.isBuffer(obj)) return `buf:${createHash("sha256").update(obj).digest("hex")}`;
  if (obj instanceof Date) return `date:${obj.toISOString()}`;
  if (seen.has(obj)) return null;
  seen.add(obj);
  const isArray = Array.isArray(obj);
  const keys = isArray ? null : Object.keys(obj).sort();
  const values: unknown[] = isArray ? (obj as unknown[]) : keys!.map((k) => (obj as Record<string, unknown>)[k]);
  const parts: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const t = stableText(values[i], seen, depth + 1);
    if (t === null) {
      seen.delete(obj);
      return null;
    }
    parts.push(isArray ? t : `${JSON.stringify(keys![i])}:${t}`);
  }
  seen.delete(obj);
  return isArray ? `[${parts.join(",")}]` : `{${parts.join(",")}}`;
}

/** The item's binary inputs by reference (id, name, type, size) — or by a
 *  hash of the inline data when there is no stored id. */
function binaryFingerprint(binary: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!binary || typeof binary !== "object") return out;
  for (const [prop, raw] of Object.entries(binary)) {
    const b = (raw ?? {}) as Record<string, unknown>;
    out[prop] = {
      id: b.id ?? null,
      fileName: b.fileName ?? null,
      mimeType: b.mimeType ?? null,
      fileSize: b.fileSize ?? null,
      data: b.id === undefined && typeof b.data === "string" ? createHash("sha256").update(b.data).digest("hex") : null,
    };
  }
  return out;
}

/**
 * The memo key for item `itemIndex` of this node run, or null (⇒ no memo).
 * Hashes every parameter the node carries, RESOLVED for this item — for a
 * tool node that is the model's `$fromAI` arguments — plus resource,
 * operation and the item's binary metadata. Request headers are not part of
 * it: they come from the credential, which is fixed within one execution.
 */
export function repeatRejectionKey(
  ctx: RepeatContext,
  resource: string,
  operation: string,
  itemIndex: number,
): string | null {
  try {
    const executionId = ctx.getExecutionId();
    if (typeof executionId !== "string" || executionId === "") return null;
    const node = ctx.getNode();
    const resolved: Record<string, unknown> = {};
    for (const name of Object.keys(node.parameters ?? {}).sort()) {
      resolved[name] = ctx.getNodeParameter(name, itemIndex, null);
    }
    const item = ctx.getInputData()[itemIndex];
    const text = stableText(
      { node: node.name, resource, operation, params: resolved, binary: binaryFingerprint(item?.binary) },
      new Set(),
      0,
    );
    if (text === null) return null;
    return `${executionId}\u0000${createHash("sha256").update(text).digest("hex")}`;
  } catch {
    return null;
  }
}

function bucketOf(key: string): [string, string] {
  const at = key.indexOf("\u0000");
  return [key.slice(0, at), key.slice(at + 1)];
}

/** The remembered rejection for this key, or undefined. Refreshes LRU order. */
export function priorRejection(key: string | null): Rejection | undefined {
  if (key === null) return undefined;
  try {
    const [exec, k] = bucketOf(key);
    const bucket = memo.get(exec);
    if (!bucket) return undefined;
    memo.delete(exec);
    memo.set(exec, bucket);
    const hit = bucket.get(k);
    if (hit === undefined) return undefined;
    bucket.delete(k);
    bucket.set(k, hit);
    return hit;
  } catch {
    return undefined;
  }
}

/** A request in this execution SUCCEEDED: forget the execution's whole memo,
 *  because the data an earlier rejection depended on may have changed. */
export function forgetRejections(ctx: Pick<RepeatContext, "getExecutionId">): void {
  try {
    const executionId = ctx.getExecutionId();
    if (typeof executionId === "string" && executionId !== "") memo.delete(executionId);
  } catch {
    // Best effort.
  }
}

/** Remember `error` under `key` when `status` is an input rejection. The
 *  FIRST rejection for a key is kept; a replay does not overwrite it. */
export function recordRejection(
  key: string | null,
  status: number | null,
  error: unknown,
  errorCode: string | null = null,
): void {
  if (key === null || !isInputRejection(status)) return;
  try {
    const [exec, k] = bucketOf(key);
    let bucket = memo.get(exec);
    if (bucket) {
      memo.delete(exec);
    } else {
      bucket = new Map();
    }
    memo.set(exec, bucket);
    while (memo.size > MAX_EXECUTIONS) {
      const oldest = memo.keys().next().value as string;
      memo.delete(oldest);
    }
    if (bucket.has(k)) return;
    let message: string;
    try {
      message = error instanceof Error ? error.message : String(error);
    } catch {
      message = `HTTP ${status}`;
    }
    bucket.set(k, {
      status: status as number,
      message: message.slice(0, REMEMBERED_MESSAGE_CHARS),
      errorCode: typeof errorCode === "string" && errorCode !== "" ? errorCode.slice(0, REMEMBERED_CODE_CHARS) : null,
      details: upstreamDetails(error),
    });
    while (bucket.size > MAX_KEYS_PER_EXECUTION) {
      const oldest = bucket.keys().next().value as string;
      bucket.delete(oldest);
    }
  } catch {
    // Remembering is best effort; a failure here must not mask the real error.
  }
}

/** True when this node run is the AI-tool variant n8n derives from a
 *  `usableAsTool` node: its type is `<package>.<nodeName>Tool`. */
export function isToolRun(ctx: RepeatContext, nodeName: string): boolean {
  try {
    return String(ctx.getNode().type).endsWith(`.${nodeName}Tool`);
  } catch {
    return false;
  }
}

/** The tool result for a call that is not sent again. `terminal` + `reason`
 *  + a non-empty string `error` is what toolErrorBudget fails the step on. */
export function terminalToolResult(prior: Rejection): {
  terminal: true;
  reason: "tool_failed";
  status: number;
  error: string;
  details?: string;
  instruction: string;
} {
  const text = prior.message && prior.message.trim() !== "" ? prior.message : `HTTP ${prior.status}`;
  return {
    terminal: true,
    reason: "tool_failed",
    status: prior.status,
    error: text.slice(0, TERMINAL_ERROR_CHARS),
    // The field paths the service named: what the model must change.
    ...(prior.details !== null ? { details: prior.details } : {}),
    instruction:
      "This exact input was already rejected. Change the input as the error says, or stop and return block.",
  };
}
