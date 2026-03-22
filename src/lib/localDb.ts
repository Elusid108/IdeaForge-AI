/**
 * In-memory fluent client mimicking the Supabase JS query surface used by IdeaForge.
 */

type Row = Record<string, unknown>;
type Filter =
  | { kind: "eq"; col: string; val: unknown }
  | { kind: "neq"; col: string; val: unknown }
  | { kind: "is"; col: string; val: unknown }
  | { kind: "not"; col: string; op: string; val: unknown }
  | { kind: "in"; col: string; vals: unknown[] }
  | { kind: "gte"; col: string; val: unknown };

const tables: Record<string, Row[]> = {};

function ensureTable(name: string): Row[] {
  if (!tables[name]) tables[name] = [];
  return tables[name];
}

function now(): string {
  return new Date().toISOString();
}

function getById(table: string, id: string): Row | undefined {
  return ensureTable(table).find((r) => r.id === id);
}

function colNull(v: unknown): boolean {
  return v === null || v === undefined;
}

function matchesFilters(row: Row, filters: Filter[]): boolean {
  for (const f of filters) {
    const v = row[f.col];
    switch (f.kind) {
      case "eq":
        if (v !== f.val) return false;
        break;
      case "neq":
        if (v === f.val) return false;
        break;
      case "is":
        if (f.val === null) {
          if (!colNull(v)) return false;
        } else if (v !== f.val) return false;
        break;
      case "not":
        if (f.op === "is" && f.val === null) {
          if (colNull(v)) return false;
        }
        break;
      case "in":
        if (!Array.isArray(f.vals) || !f.vals.includes(v)) return false;
        break;
      case "gte": {
        const t = new Date(String(v)).getTime();
        const u = new Date(String(f.val)).getTime();
        if (Number.isNaN(t) || Number.isNaN(u) || t < u) return false;
        break;
      }
      default:
        break;
    }
  }
  return true;
}

function sortRows(rows: Row[], col: string, ascending: boolean): Row[] {
  return [...rows].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    if (av == null && bv == null) return 0;
    if (av == null) return ascending ? 1 : -1;
    if (bv == null) return ascending ? -1 : 1;
    if (typeof av === "number" && typeof bv === "number") {
      const d = av - bv;
      return ascending ? d : -d;
    }
    const at = new Date(String(av)).getTime();
    const bt = new Date(String(bv)).getTime();
    if (!Number.isNaN(at) && !Number.isNaN(bt)) {
      const d = at - bt;
      return ascending ? d : -d;
    }
    const cmp = String(av).localeCompare(String(bv));
    return ascending ? cmp : -cmp;
  });
}

function enrichRows(table: string, rows: Row[], selectStr: string): Row[] {
  if (!selectStr.includes("(")) return rows;
  const re = /,\s*(\w+)\(([^)]+)\)/g;
  const joins: { fk: string; fields: string[] }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(selectStr))) {
    joins.push({ fk: m[1], fields: m[2].split(",").map((s) => s.trim()) });
  }
  if (joins.length === 0) return rows;

  return rows.map((r) => {
    const out: Row = { ...r };
    for (const j of joins) {
      const nested: Record<string, unknown> = {};
      if (table === "brainstorms" && j.fk === "ideas") {
        const idea = r.idea_id ? getById("ideas", String(r.idea_id)) : undefined;
        if (idea) for (const f of j.fields) nested[f] = idea[f];
        out[j.fk] = nested;
      } else if (table === "projects" && j.fk === "brainstorms") {
        const b = r.brainstorm_id ? getById("brainstorms", String(r.brainstorm_id)) : undefined;
        if (b) for (const f of j.fields) nested[f] = b[f];
        out[j.fk] = nested;
      } else {
        out[j.fk] = nested;
      }
    }
    return out;
  });
}

function projectFlat(row: Row, selectStr: string): Row {
  if (selectStr === "*" || selectStr.includes("(")) return { ...row };
  const cols = selectStr.split(",").map((c) => c.trim()).filter(Boolean);
  const o: Row = {};
  for (const c of cols) o[c] = row[c];
  return o;
}

function applyInsertDefaults(table: string, row: Row): Row {
  const id = (row.id as string) || crypto.randomUUID();
  const t = now();
  const base: Row = {
    ...row,
    id,
    created_at: row.created_at ?? t,
    updated_at: row.updated_at ?? t,
  };
  if (table === "ideas" && base.status === undefined) base.status = "new";
  if (table === "brainstorms" && base.status === undefined) base.status = "active";
  if (table === "projects" && base.status === undefined) base.status = "planning";
  if (table === "project_tasks" && base.completed === undefined) base.completed = false;
  if (table === "campaign_tasks" && base.completed === undefined) base.completed = false;
  if (table === "gotchas" && base.status === undefined) base.status = "open";
  if (table === "campaigns" && base.status === undefined) base.status = "foundation_ip";
  return base;
}

function processIdeaAfterInvoke(body: { idea_id?: string; raw_dump?: string }) {
  const id = body.idea_id;
  if (!id) return;
  const list = ensureTable("ideas");
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const raw = String(body.raw_dump || list[idx].raw_dump || "");
  const title = raw.split(/\s+/).slice(0, 8).join(" ") || "Untitled";
  list[idx] = {
    ...list[idx],
    status: "processed",
    title,
    processed_summary: raw.slice(0, 280),
    category: "Software/App",
    tags: ["local"],
    key_features: "",
    updated_at: now(),
  };
}

async function invokeFunction(name: string, options?: { body?: Record<string, unknown> }): Promise<{ data: unknown; error: Error | null }> {
  const body = options?.body ?? {};
  switch (name) {
    case "process-idea":
      processIdeaAfterInvoke(body as { idea_id?: string; raw_dump?: string });
      return { data: { ok: true }, error: null };
    case "project-chat":
      return {
        data: {
          message: "Local mode: connect a backend to enable the project assistant.",
          actions: [] as unknown[],
        },
        error: null,
      };
    case "brainstorm-chat": {
      const mode = body.mode as string | undefined;
      if (mode === "generate_question") {
        return { data: { question: "What is the core problem this idea solves?" }, error: null };
      }
      if (mode === "submit_answer") {
        return {
          data: {
            updated_description: String(body.compiled_description ?? ""),
            updated_bullets: String(body.bullet_breakdown ?? ""),
            updated_tags: [] as string[],
            next_question: "What constraints or risks should we consider?",
            clarification: null,
          },
          error: null,
        };
      }
      if (mode === "chat_query") {
        return {
          data: {
            answer: "Local mode: AI responses are disabled. Connect a backend to enable full chat.",
            actions: [] as unknown[],
          },
          error: null,
        };
      }
      return { data: { message: "OK", actions: [] as unknown[] }, error: null };
    }
    case "campaign-chat": {
      const cmode = body.mode as string | undefined;
      if (cmode === "generate_question") {
        return {
          data: {
            question: "What is the primary outcome you want from this campaign?",
            topics_remaining: 5,
          },
          error: null,
        };
      }
      if (cmode === "submit_answer") {
        return {
          data: {
            next_question: "Who is the ideal customer?",
            clarification: null,
            topics_remaining: 4,
          },
          error: null,
        };
      }
      if (cmode === "forge_playbook") {
        return {
          data: {
            playbook: "# Campaign playbook (local stub)\n\nGoals, audience, and channels TBD.",
            ip_strategy: "",
            monetization_plan: "",
            marketing_plan: "",
            operations_plan: "",
            sales_model: "",
            primary_channel: "",
            tasks: [] as unknown[],
          },
          error: null,
        };
      }
      if (cmode === "assistant") {
        return {
          data: {
            message: "Local mode: campaign assistant is offline. Connect a backend for full AI.",
            actions: [] as unknown[],
          },
          error: null,
        };
      }
      return {
        data: {
          message: "OK",
          actions: [] as unknown[],
        },
        error: null,
      };
    }
    case "gotcha-chat":
      return {
        data: {
          next_question: "What conditions led to this symptom?",
        },
        error: null,
      };
    case "generate-strategy":
      return {
        data: {
          strategy: "## Execution strategy (local stub)\n\n1. Validate assumptions\n2. Build a thin slice\n3. Ship and iterate",
        },
        error: null,
      };
    case "fetch-link-preview":
      return { data: { thumbnail_url: null as string | null, title: "", description: "" }, error: null };
    default:
      return { data: null, error: null };
  }
}

class StorageBucket {
  constructor(private bucket: string) {}
  async upload(path: string, _file: File | Blob): Promise<{ error: Error | null }> {
    void path;
    void _file;
    return { error: null };
  }
  getPublicUrl(path: string): { data: { publicUrl: string } } {
    const url = `https://local.invalid/${this.bucket}/${encodeURIComponent(path)}`;
    return { data: { publicUrl: url } };
  }
}

class StorageApi {
  from(bucket: string) {
    return new StorageBucket(bucket);
  }
}

type RunResult = {
  data: unknown;
  error: Error | null;
  count?: number;
};

class QueryBuilder implements PromiseLike<RunResult> {
  private filters: Filter[] = [];
  private orderCol?: string;
  private orderAsc = true;
  private limitN?: number;
  private countOnly = false;
  private head = false;

  constructor(
    private table: string,
    public op: "select" | "insert" | "update" | "delete",
    private payload?: Row,
    private selectStr = "*",
  ) {}

  select(columns = "*", options?: { count?: "exact"; head?: boolean }): this {
    if (typeof columns === "string") this.selectStr = columns;
    if (options?.count === "exact" && options?.head) {
      this.countOnly = true;
      this.head = true;
    }
    return this;
  }

  insert(row: Row) {
    this.op = "insert";
    this.payload = row;
    return this;
  }

  update(row: Row) {
    this.op = "update";
    this.payload = row;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }

  neq(col: string, val: unknown) {
    this.filters.push({ kind: "neq", col, val });
    return this;
  }

  is(col: string, val: unknown) {
    this.filters.push({ kind: "is", col, val });
    return this;
  }

  not(col: string, op: string, val: unknown) {
    this.filters.push({ kind: "not", col, op, val });
    return this;
  }

  in(col: string, vals: unknown[]) {
    this.filters.push({ kind: "in", col, vals });
    return this;
  }

  gte(col: string, val: unknown) {
    this.filters.push({ kind: "gte", col, val });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  single(): Promise<{ data: Row | null; error: Error | null }> {
    return this.then((res) => {
      if (res.error) return { data: null, error: res.error };
      if (this.countOnly) return { data: null, error: new Error("invalid single on count") };
      const d = res.data;
      const rows: Row[] = Array.isArray(d) ? d : d && typeof d === "object" ? [d as Row] : [];
      if (rows.length === 0) {
        return { data: null, error: new Error("PGRST116: JSON object requested, multiple (or no) rows returned") };
      }
      if (rows.length > 1) {
        return { data: null, error: new Error("PGRST116: multiple rows returned") };
      }
      return { data: rows[0], error: null };
    });
  }

  maybeSingle(): Promise<{ data: Row | null; error: Error | null }> {
    return this.then((res) => {
      if (res.error) return { data: null, error: res.error };
      if (this.countOnly) return { data: null, error: new Error("invalid maybeSingle on count") };
      const d = res.data;
      const rows: Row[] = Array.isArray(d) ? d : d && typeof d === "object" ? [d as Row] : [];
      if (rows.length === 0) return { data: null, error: null };
      if (rows.length > 1) return { data: null, error: new Error("multiple rows returned") };
      return { data: rows[0], error: null };
    });
  }

  private run(): RunResult {
    const list = ensureTable(this.table);

    if (this.op === "insert" && this.payload) {
      const row = applyInsertDefaults(this.table, { ...this.payload });
      list.push(row);
      let projected: Row = row;
      if (this.selectStr && this.selectStr !== "*" && !this.selectStr.includes("(")) {
        projected = projectFlat(row, this.selectStr);
      }
      return { data: [projected], error: null };
    }

    if (this.op === "update" && this.payload) {
      for (let i = 0; i < list.length; i++) {
        if (matchesFilters(list[i], this.filters)) {
          list[i] = { ...list[i], ...this.payload, updated_at: now() };
        }
      }
      return { data: null, error: null };
    }

    if (this.op === "delete") {
      const next: Row[] = [];
      for (const r of list) {
        if (matchesFilters(r, this.filters)) continue;
        next.push(r);
      }
      tables[this.table] = next;
      return { data: null, error: null };
    }

    let rows = list.filter((r) => matchesFilters(r, this.filters));
    if (this.orderCol) rows = sortRows(rows, this.orderCol, this.orderAsc);
    if (this.limitN != null) rows = rows.slice(0, this.limitN);

    if (this.countOnly && this.head) {
      return { data: null, error: null, count: rows.length };
    }

    rows = enrichRows(this.table, rows, this.selectStr);
    if (this.selectStr !== "*" && !this.selectStr.includes("(")) {
      rows = rows.map((r) => projectFlat(r, this.selectStr));
    }

    return { data: rows, error: null };
  }

  then<TResult1 = RunResult, TResult2 = never>(
    onfulfilled?: ((value: RunResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const res = this.run();
    if (this.countOnly && this.head) {
      const shaped = { count: res.count ?? 0, error: res.error, data: null };
      return Promise.resolve(shaped as unknown as TResult1).then(onfulfilled as any, onrejected);
    }
    return Promise.resolve(res).then(onfulfilled as any, onrejected);
  }
}

function fromTable(table: string) {
  return new QueryBuilder(table, "select");
}

export const supabase = {
  from: (table: string) => fromTable(table),
  storage: new StorageApi(),
  functions: {
    invoke: (name: string, options?: { body?: Record<string, unknown> }) => invokeFunction(name, options),
  },
};
