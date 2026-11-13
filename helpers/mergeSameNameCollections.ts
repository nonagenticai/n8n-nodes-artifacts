// ⛔ AUTO-GENERATED — DO NOT EDIT. Verbatim copy of
// n8n_module_scripts/scripts/lib/merge-same-name-collections.ts, written by
// generate-node.ts / merge-collections-in-package.ts. Edit the source there.
/**
 * mergeSameNameCollections — collapse same-named `collection` /
 * `fixedCollection` node parameters into ONE definition per node.
 *
 * ─────────────────────────────── THE DEFECT ────────────────────────────────
 * Many @nonagentic node packages declare a collection with the SAME name once
 * per resource (metering `additionalOptions` ×11, kanban `updateFields` ×15),
 * each gated by `displayOptions.show.resource`. When a caller sets `resource`
 * by EXPRESSION (ncn's generic typed-step dispatchers), n8n-workflow's
 * `NodeHelpers.getNodeParameters` cannot evaluate the gate, displays EVERY
 * definition, and the LAST one processed overwrites the stored value — keeping
 * only the children that definition declares. Measured: kanban `updateFields`
 * kept 1 of 55 children, metering `additionalOptions` 8 of 34.
 *
 * ─────────────────────────────── THE TRANSFORM ─────────────────────────────
 * Every child of every member is collected into ONE child list:
 *   • every child carries its ORIGINAL member's scope, rewritten to absolute
 *     paths (`resource` → `/resource`, `operation` → `/operation`) — inside a
 *     collection a bare key resolves against the collection's own value, not
 *     the node's parameter. It is composed (AND) with any displayOptions the
 *     child already had, e.g. the per-op `/operation` gate generate-node.ts
 *     emits (renderQueryChildDisplayOptions, #94), including the child's own
 *     `hide`. A key whose value is identical across ALL members is enforced
 *     by the parent and not repeated on children.
 * The PARENT's visibility must be EXACTLY the union of the members' own
 * visibility — a pair no member displayed must still resolve to "absent",
 * not to `{}`. n8n's `show` is an AND over keys of an OR over values (a cross
 * product), so the union is expressed as the fewest products that cover it
 * (parentConditions): two members combine when they differ on one key, or on
 * two keys where every added mixed pair is one n8n can never present (the
 * operation parameter does not offer that operation for that resource).
 * Each product is emitted as its own definition carrying the FULL child list,
 * at the position of its first member (whose displayName etc. it keeps). In
 * the published 0.1.1 packages 14 of 17 groups collapse to one definition; kanban
 * additionalFields, requirements and coding additionalOptions need two.
 * Result, verified against the real n8n-workflow 2.18.3 (see
 * merge-same-name-collections.harness.test.ts, on full real descriptions):
 *   • expression resource ⇒ every child survives, whichever definition n8n
 *     processes last (they carry the same children);
 *   • literal resource ⇒ at most one definition displays, and it keeps
 *     exactly the children the old description kept.
 * Children that share a name across members (e.g. `limit` with different
 * defaults, `language` as options vs string) are kept as separate entries,
 * each with its own scope: getNodeParameters copies a provided collection
 * value verbatim for each displayed duplicate, so nothing is lost.
 *
 * ─────────────────────────────── WHAT IS NOT MERGED ───────────────────────
 *   • `collection` with typeOptions.multipleValues=true: getNodeParameters
 *     copies its raw value without filtering children, so there is no loss.
 *   • a name whose members are not ALL the same collection type (e.g. a
 *     collection in one resource, a json param in another): merging the
 *     collections would still leave a duplicate that overwrites, so the group
 *     is reported in `skipped` and left untouched.
 *   • fixedCollection members with differing multipleValues (their stored
 *     shapes differ: array rows vs single object).
 *   • only the TOP-LEVEL array passed in is examined; relative display keys
 *     are only equivalent to absolute ones at the root.
 *
 * fixedCollection has the same loss (each definition only keeps the item
 * names in ITS options, and a multipleValues one THROWS "Could not find
 * property option" on a foreign item name), so it is merged too: options are
 * unioned by name and each option's `values` children get the member scope.
 *
 * Pure and idempotent: the input is not mutated, non-grouped params are
 * returned by reference, and a merged list contains no group to merge (a
 * group whose definitions all carry identical children is left alone).
 *
 * ⛔ SINGLE SOURCE OF TRUTH: n8n_module_scripts/scripts/lib/. generate-node.ts
 * copies this file verbatim into each generated package as
 * helpers/mergeSameNameCollections.ts, and
 * scripts/merge-collections-in-package.ts does the same for hand-written
 * packages. Edit it here, never in a package. It must stay dependency-free
 * and compile under a package's `strict` tsconfig.
 */

type Dict = Record<string, unknown>;

export interface MergeGroupReport {
  name: string;
  type: string;
  members: number;
  children: number;
  /** Definitions emitted: 1 when the members' visibility is one n8n
   *  displayOptions, more when it is not (each carries every child). */
  definitions: number;
}

export interface MergeSkipReport {
  name: string;
  reason: string;
}

export interface MergeReport {
  merged: MergeGroupReport[];
  skipped: MergeSkipReport[];
}

const MERGEABLE_TYPES = ["collection", "fixedCollection"];

function isDict(v: unknown): v is Dict {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stable(v: unknown): string {
  return JSON.stringify(v);
}

function absolutize(key: string): string {
  return key.charAt(0) === "/" || key.charAt(0) === "@" ? key : `/${key}`;
}

function dedupe(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const v of values) {
    const k = stable(v);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [v];
}

function multipleValues(p: Dict): boolean {
  return isDict(p.typeOptions) && p.typeOptions.multipleValues === true;
}

interface Scope {
  show: Array<[string, unknown[]]>;
  hide: Array<[string, unknown[]]>;
  other: Array<[string, unknown]>;
}

interface ParentSplit {
  /** One parent displayOptions per emitted definition (see mergeGroup). */
  parents: Array<{ displayOptions: Dict | undefined; lead: number }>;
  scopes: Scope[];
}

function sameSet(a: unknown, b: unknown): boolean {
  const x = dedupe(asArray(a)).map(stable).sort();
  const y = dedupe(asArray(b)).map(stable).sort();
  return stable(x) === stable(y);
}

function withoutShow(d: Dict): Dict {
  const out: Dict = {};
  for (const k of Object.keys(d).sort()) if (k !== "show") out[k] = d[k];
  return out;
}

/** The literal values of root parameter `key` that n8n OFFERS when root
 *  parameter `ctxKey` equals `ctxValue` — the union of the `options` of every
 *  definition of `key` not gated away from `ctxValue`. `null` = unknown (no
 *  such parameter, or a definition live under `ctxValue` without a literal
 *  options list): the caller must then treat every value as reachable. */
function offeredValues(root: readonly Dict[], key: string, ctxKey: string, ctxValue: unknown): Set<string> | null {
  const defs = root.filter((p) => p.name === key);
  if (defs.length === 0) return null;
  const out = new Set<string>();
  for (const d of defs) {
    const show = isDict(d.displayOptions) && isDict(d.displayOptions.show) ? d.displayOptions.show : {};
    const gate = Object.prototype.hasOwnProperty.call(show, ctxKey) ? show[ctxKey] : show[`/${ctxKey}`];
    if (gate !== undefined) {
      const vals = asArray(gate);
      if (!vals.every(isPrimitive)) return null;
      if (!vals.some((v) => stable(v) === stable(ctxValue))) continue; // not offered under ctxValue
    }
    if (!Array.isArray(d.options)) return null; // e.g. a free-text field of the same name
    for (const o of d.options) {
      if (!isDict(o) || !isPrimitive(o.value)) return null;
      out.add(stable(o.value));
    }
  }
  return out;
}

/** True when n8n can never present `k1 = x` together with `k2 = y`, because
 *  the options parameter of one key does not offer that value under the other
 *  (e.g. operation "getTocConfig" is not an operation of resource "toc"). */
function unreachable(root: readonly Dict[], k1: string, x: unknown, k2: string, y: unknown): boolean {
  const a = offeredValues(root, k2, k1, x);
  if (a !== null && !a.has(stable(y))) return true;
  const b = offeredValues(root, k1, k2, y);
  return b !== null && !b.has(stable(x));
}

/** Union of two parent conditions when it is expressible EXACTLY as one n8n
 *  displayOptions, else null.
 *
 *  n8n's `show` is an AND over keys of an OR over each key's values, i.e. a
 *  cross product. The union of two products is itself a product only when
 *  they differ on at most ONE key. When they differ on exactly two keys the
 *  cross product adds the mixed pairs (x from A, y from B); the union is still
 *  accepted when every added pair is one n8n can never present (checked via
 *  `unreachable` against the root parameters), since such a pair has no
 *  literal value that could observe the difference. Otherwise the members
 *  stay separate definitions. */
function combine(a: Dict | undefined, b: Dict | undefined, root: readonly Dict[]): Dict | undefined | null {
  if (a === undefined || b === undefined) return undefined; // ungated covers everything
  if (stable(withoutShow(a)) !== stable(withoutShow(b))) return null;
  const sa: Dict = isDict(a.show) ? a.show : {};
  const sb: Dict = isDict(b.show) ? b.show : {};
  const ka = Object.keys(sa);
  if (stable([...ka].sort()) !== stable(Object.keys(sb).sort())) return null;
  const diff = ka.filter((k) => !sameSet(sa[k], sb[k]));
  if (diff.length === 0) return a;
  if (diff.length > 2) return null;
  if (diff.length === 2) {
    const [k1, k2] = diff;
    const [a1, a2, b1, b2] = [sa[k1], sa[k2], sb[k1], sb[k2]].map(asArray);
    if (![...a1, ...a2, ...b1, ...b2].every(isPrimitive)) return null;
    const has = (list: unknown[], v: unknown) => list.some((w) => stable(w) === stable(v));
    const xs = dedupe([...a1, ...b1]);
    const ys = dedupe([...a2, ...b2]);
    for (const x of xs)
      for (const y of ys) {
        const inA = has(a1, x) && has(a2, y);
        const inB = has(b1, x) && has(b2, y);
        if (!inA && !inB && !unreachable(root, k1, x, k2, y)) return null;
      }
  }
  const show: Dict = {};
  for (const k of ka) show[k] = diff.includes(k) ? dedupe([...asArray(sa[k]), ...asArray(sb[k])]) : sa[k];
  return { ...a, show };
}

/** Parent visibility: the smallest set of displayOptions whose union is
 *  EXACTLY the union of the members' own visibility (modulo pairs n8n can
 *  never present). Each is emitted as its own definition carrying ALL merged
 *  children, so a literal resource displays exactly one (they are disjoint
 *  whenever the members were) and an expression resource keeps every child
 *  whichever definition is processed last. */
function parentConditions(members: Dict[], root: readonly Dict[]): Array<{ displayOptions: Dict | undefined; lead: number }> {
  const conds = members.map((m, i) => {
    const d = isDict(m.displayOptions) && Object.keys(m.displayOptions).length > 0 ? m.displayOptions : undefined;
    return { displayOptions: d, lead: i };
  });
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < conds.length; i++) {
      for (let j = i + 1; j < conds.length; j++) {
        const c = combine(conds[i].displayOptions, conds[j].displayOptions, root);
        if (c === null) continue;
        conds[i] = { displayOptions: c, lead: Math.min(conds[i].lead, conds[j].lead) };
        conds.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return conds;
}

/** Split the members' displayOptions into the parent definitions' displayOptions
 *  and a per-member residual scope for its children. */
function splitDisplayOptions(members: Dict[], root: readonly Dict[]): ParentSplit {
  const dos: Dict[] = members.map((m) => (isDict(m.displayOptions) ? m.displayOptions : {}));
  const shows: Dict[] = dos.map((d) => (isDict(d.show) ? d.show : {}));
  const hides: Dict[] = dos.map((d) => (isDict(d.hide) ? d.hide : {}));

  const orderedKeys = (maps: Dict[]): string[] => {
    const keys: string[] = [];
    for (const m of maps) for (const k of Object.keys(m)) if (!keys.includes(k)) keys.push(k);
    return keys;
  };
  const inAll = (maps: Dict[], k: string): boolean => maps.every((m) => Object.prototype.hasOwnProperty.call(m, k));
  const identical = (maps: Dict[], k: string): boolean =>
    inAll(maps, k) && maps.every((m) => stable(m[k]) === stable(maps[0][k]));

  // A key identical across ALL members is enforced by every parent (each
  // parent condition is a union of member conditions), so children need not
  // repeat it. Every other key is the child's own member scope.
  const sharedShow = new Set(orderedKeys(shows).filter((k) => identical(shows, k)));
  const sharedHide = new Set(orderedKeys(hides).filter((k) => identical(hides, k)));
  const sharedOther = new Set(
    orderedKeys(dos).filter((k) => k !== "show" && k !== "hide" && identical(dos, k)),
  );

  const scopes: Scope[] = members.map((_, i) => ({
    show: Object.keys(shows[i])
      .filter((k) => !sharedShow.has(k))
      .map((k): [string, unknown[]] => [absolutize(k), asArray(shows[i][k])]),
    hide: Object.keys(hides[i])
      .filter((k) => !sharedHide.has(k))
      .map((k): [string, unknown[]] => [absolutize(k), asArray(hides[i][k])]),
    other: Object.keys(dos[i])
      .filter((k) => k !== "show" && k !== "hide" && !sharedOther.has(k))
      .map((k): [string, unknown] => [k, dos[i][k]]),
  }));

  return { parents: parentConditions(members, root), scopes };
}

function isPrimitive(v: unknown): boolean {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

/** AND a member scope onto a child's own displayOptions. Scope keys come
 *  first (the parent used to be checked before the child). */
function scopeChild(child: Dict, scope: Scope, context: string): Dict {
  if (scope.show.length === 0 && scope.hide.length === 0 && scope.other.length === 0) return child;
  const own: Dict = isDict(child.displayOptions) ? child.displayOptions : {};
  const ownShow: Dict = isDict(own.show) ? own.show : {};
  const ownHide: Dict = isDict(own.hide) ? own.hide : {};

  const show: Dict = {};
  for (const [k, v] of scope.show) show[k] = v;
  for (const k of Object.keys(ownShow)) {
    const mine = asArray(ownShow[k]);
    if (!Object.prototype.hasOwnProperty.call(show, k)) {
      show[k] = ownShow[k];
      continue;
    }
    const theirs = show[k] as unknown[];
    if (![...mine, ...theirs].every(isPrimitive)) {
      throw new Error(
        `mergeSameNameCollections: cannot intersect non-primitive displayOptions.show["${k}"] on ${context}`,
      );
    }
    const keep = new Set(mine.map(stable));
    show[k] = theirs.filter((v) => keep.has(stable(v)));
  }

  const hide: Dict = {};
  for (const [k, v] of scope.hide) hide[k] = v;
  for (const k of Object.keys(ownHide)) {
    hide[k] = Object.prototype.hasOwnProperty.call(hide, k)
      ? dedupe([...(hide[k] as unknown[]), ...asArray(ownHide[k])])
      : ownHide[k];
  }

  const displayOptions: Dict = {};
  for (const [k, v] of scope.other) displayOptions[k] = v;
  for (const k of Object.keys(own)) if (k !== "show" && k !== "hide") displayOptions[k] = own[k];
  if (Object.keys(show).length > 0) displayOptions.show = show;
  if (Object.keys(hide).length > 0) displayOptions.hide = hide;
  return { ...child, displayOptions };
}

/** Append `child` unless an exactly identical entry is already present. */
function pushUnique(list: Dict[], child: Dict): void {
  const key = stable(child);
  if (!list.some((c) => stable(c) === key)) list.push(child);
}

/** Merge one group. Returns one definition per parent condition, keyed by
 *  the member index it replaces (its lead member: display texts come from it). */
function mergeGroup(members: Dict[], root: readonly Dict[]): Array<{ lead: number; prop: Dict }> {
  const { parents, scopes } = splitDisplayOptions(members, root);
  const first = members[0];

  let buildOptions: () => Dict[];
  if (first.type === "collection") {
    const children: Dict[] = [];
    members.forEach((m, i) => {
      for (const c of (m.options as unknown[]) ?? []) {
        if (!isDict(c)) continue;
        pushUnique(children, scopeChild(c, scopes[i], `${String(first.name)}.${String(c.name)}`));
      }
    });
    buildOptions = () => children.slice();
  } else {
    const groups: Dict[] = [];
    members.forEach((m, i) => {
      for (const opt of (m.options as unknown[]) ?? []) {
        if (!isDict(opt)) continue;
        let target = groups.find((g) => g.name === opt.name);
        if (!target) {
          target = { ...opt, values: [] };
          groups.push(target);
        }
        const values = target.values as Dict[];
        for (const v of (opt.values as unknown[]) ?? []) {
          if (!isDict(v)) continue;
          pushUnique(values, scopeChild(v, scopes[i], `${String(first.name)}.${String(opt.name)}.${String(v.name)}`));
        }
      }
    });
    buildOptions = () => groups.map((g) => ({ ...g, values: (g.values as Dict[]).slice() }));
  }

  return parents.map(({ displayOptions, lead }) => {
    const prop: Dict = { ...members[lead] };
    if (displayOptions) prop.displayOptions = displayOptions;
    else delete prop.displayOptions;
    prop.options = buildOptions();
    return { lead, prop };
  });
}

function childCount(p: Dict): number {
  const opts = Array.isArray(p.options) ? p.options : [];
  if (p.type === "collection") return opts.length;
  return opts.reduce((n: number, o: unknown) => n + (isDict(o) && Array.isArray(o.values) ? o.values.length : 0), 0);
}

/** Merge same-named collections and report what was merged / skipped. */
export function mergeSameNameCollectionsWithReport<T extends { name: string; type: string }>(
  properties: readonly T[],
): { properties: T[]; report: MergeReport } {
  const report: MergeReport = { merged: [], skipped: [] };
  const byName = new Map<string, number[]>();
  properties.forEach((p, i) => {
    const list = byName.get(p.name);
    if (list) list.push(i);
    else byName.set(p.name, [i]);
  });

  const replaceAt = new Map<number, T>();
  const drop = new Set<number>();
  for (const [name, idxs] of byName) {
    if (idxs.length < 2) continue;
    const members = idxs.map((i) => properties[i] as unknown as Dict);
    const types = new Set(members.map((m) => String(m.type)));
    const anyCollection = members.some((m) => MERGEABLE_TYPES.includes(String(m.type)));
    if (!anyCollection) continue; // duplicate simple params: n8n handles those per display
    if (types.size > 1) {
      report.skipped.push({ name, reason: `mixed types: ${[...types].join(", ")}` });
      continue;
    }
    const type = String(members[0].type);
    const mv = new Set(members.map(multipleValues));
    if (type === "collection" && mv.has(true)) {
      if (mv.size > 1) report.skipped.push({ name, reason: "collection with mixed multipleValues" });
      continue; // multipleValues collections are copied raw: no loss
    }
    if (type === "fixedCollection" && mv.size > 1) {
      report.skipped.push({ name, reason: "fixedCollection with mixed multipleValues" });
      continue;
    }
    // Already merged (or authored that way): every definition carries the same
    // children, so whichever one n8n processes last keeps all of them.
    if (members.every((m) => stable(m.options) === stable(members[0].options))) continue;
    const defs = mergeGroup(members, properties as unknown as Dict[]);
    for (const { lead, prop } of defs) replaceAt.set(idxs[lead], prop as unknown as T);
    const kept = new Set(defs.map((d) => idxs[d.lead]));
    for (const i of idxs) if (!kept.has(i)) drop.add(i);
    report.merged.push({ name, type, members: idxs.length, children: childCount(defs[0].prop), definitions: defs.length });
  }

  if (replaceAt.size === 0) return { properties: properties.slice(), report };
  const out: T[] = [];
  properties.forEach((p, i) => {
    if (drop.has(i)) return;
    out.push(replaceAt.get(i) ?? p);
  });
  return { properties: out, report };
}

/** Merge same-named collections (see the file header for the semantics). */
export function mergeSameNameCollections<T extends { name: string; type: string }>(properties: readonly T[]): T[] {
  return mergeSameNameCollectionsWithReport(properties).properties;
}
