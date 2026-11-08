/**
 * Minimal in-memory stand-in for the parts of Firestore (Admin SDK) this
 * project uses, so the real Express app + real services can be exercised
 * end to end in Jest without network or credentials.
 */
class FakeTimestamp {
  constructor(d) { this._d = d; }
  toDate() { return this._d; }
  get _seconds() { return Math.floor(this._d.getTime() / 1000); }
}
const SERVER_TS = { __op: "serverTimestamp" };
const isOp = (v, op) => v && typeof v === "object" && v.__op === op;

function clone(v) {
  if (v instanceof FakeTimestamp) return v;
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = clone(v[k]); return o; }
  return v;
}
function resolve(prev, value) {
  if (isOp(value, "serverTimestamp")) return new FakeTimestamp(new Date());
  if (isOp(value, "arrayUnion")) { const a = Array.isArray(prev) ? [...prev] : []; value.items.forEach((i) => { if (!a.includes(i)) a.push(i); }); return a; }
  if (isOp(value, "increment")) return (Number(prev) || 0) + value.n;
  return value;
}
function applyWrite(target, data) {
  const out = clone(target);
  for (const [k, v] of Object.entries(data)) {
    if (isOp(v, "delete")) { delete out[k]; continue; }
    const parts = k.split(".");
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) { node[parts[i]] = node[parts[i]] && typeof node[parts[i]] === "object" ? node[parts[i]] : {}; node = node[parts[i]]; }
    const last = parts[parts.length - 1];
    node[last] = resolve(node[last], v && typeof v === "object" && !Array.isArray(v) && !(v instanceof FakeTimestamp) && !v.__op ? applyWrite({}, v) : v);
  }
  return out;
}
const comparable = (v) => (v instanceof FakeTimestamp ? v._d.getTime() : v);

class Store { constructor() { this.cols = new Map(); this.n = 0; } col(name) { if (!this.cols.has(name)) this.cols.set(name, new Map()); return this.cols.get(name); } }

class DocSnap {
  constructor(ref, data) { this.ref = ref; this.id = ref.id; this._data = data; this.exists = data !== undefined; }
  data() { return this._data === undefined ? undefined : clone(this._data); }
}
class DocRef {
  constructor(store, col, id) { this.store = store; this.colName = col; this.id = id; }
  async get() { const d = this.store.col(this.colName).get(this.id); return new DocSnap(this, d); }
  async set(data) { this.store.col(this.colName).set(this.id, applyWrite({}, data)); }
  async create(data) { if (this.store.col(this.colName).has(this.id)) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 }); return this.set(data); }
  async update(data) {
    const cur = this.store.col(this.colName).get(this.id);
    if (cur === undefined) throw Object.assign(new Error("NOT_FOUND"), { code: 5 });
    this.store.col(this.colName).set(this.id, applyWrite(cur, data));
  }
  async delete() { this.store.col(this.colName).delete(this.id); }
}
class Query {
  constructor(store, col, filters = [], order = null, lim = null) { this.store = store; this.colName = col; this.filters = filters; this.order = order; this.lim = lim; }
  where(f, op, v) { return new Query(this.store, this.colName, [...this.filters, [f, op, v]], this.order, this.lim); }
  orderBy(f, dir = "asc") { return new Query(this.store, this.colName, this.filters, [f, dir], this.lim); }
  limit(n) { return new Query(this.store, this.colName, this.filters, this.order, n); }
  _run() {
    let rows = [...this.store.col(this.colName).entries()].map(([id, d]) => new DocSnap(new DocRef(this.store, this.colName, id), d));
    for (const [f, op, v] of this.filters) {
      rows = rows.filter((s) => {
        const x = f.split(".").reduce((o, k) => (o == null ? undefined : o[k]), s._data);
        const a = comparable(x), b = comparable(v);
        switch (op) {
          case "==": return a === b;
          case "!=": return a !== b;
          case "<": return a < b; case "<=": return a <= b; case ">": return a > b; case ">=": return a >= b;
          case "in": return v.includes(x);
          case "array-contains": return Array.isArray(x) && x.includes(v);
          case "array-contains-any": return Array.isArray(x) && x.some((i) => v.includes(i));
          default: throw new Error(`fake firestore: unsupported op ${op}`);
        }
      });
    }
    if (this.order) {
      const [f, dir] = this.order;
      rows = rows.filter((s) => s._data[f] !== undefined);
      rows.sort((p, q) => { const a = comparable(p._data[f]), b = comparable(q._data[f]); return (a > b ? 1 : a < b ? -1 : 0) * (dir === "desc" ? -1 : 1); });
    }
    if (this.lim != null) rows = rows.slice(0, this.lim);
    return rows;
  }
  async get() { const docs = this._run(); return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn) }; }
  count() { return { get: async () => ({ data: () => ({ count: this._run().length }) }) }; }
}
class ColRef extends Query {
  doc(id) { return new DocRef(this.store, this.colName, id || `auto${++this.store.n}_${Math.random().toString(36).slice(2, 8)}`); }
  async add(data) { const ref = this.doc(); await ref.set(data); return ref; }
}

function create() {
  const store = new Store();
  const db = {
    collection: (n) => new ColRef(store, n),
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, d) => writes.push(() => ref.set(d)),
        update: (ref, d) => writes.push(() => ref.update(d)),
        delete: (ref) => writes.push(() => ref.delete()),
        create: (ref, d) => writes.push(() => ref.create(d)),
      };
      const out = await fn(tx);
      for (const w of writes) await w();
      return out;
    },
    batch() {
      const ops = [];
      return { set: (r, d) => ops.push(() => r.set(d)), update: (r, d) => ops.push(() => r.update(d)), delete: (r) => ops.push(() => r.delete()), commit: async () => { for (const o of ops) await o(); } };
    },
  };
  const FieldValue = {
    serverTimestamp: () => SERVER_TS,
    arrayUnion: (...items) => ({ __op: "arrayUnion", items }),
    increment: (n) => ({ __op: "increment", n }),
    delete: () => ({ __op: "delete" }),
  };
  const Timestamp = { now: () => new FakeTimestamp(new Date()), fromDate: (d) => new FakeTimestamp(d) };
  return { db, FieldValue, Timestamp, admin: {}, __store: store };
}

module.exports = { create };
