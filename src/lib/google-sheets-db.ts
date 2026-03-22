/**
 * Google Sheets-backed data access layer (Drive + Sheets REST via fetch).
 * Uses the same OAuth token as {@link @/lib/google-api} / AuthContext.
 */

import {
  getAccessToken,
  handleTokenExpiration,
} from "@/lib/google-api";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const DB_SPREADSHEET_TITLE = "IdeaForge_DB";
const STORAGE_KEY_SPREADSHEET_ID = "ideaforge_sheets_db_id";

export type CoreTableName =
  | "ideas"
  | "projects"
  | "brainstorms"
  | "campaigns"
  | "project_tasks"
  | "campaign_tasks"
  | "gotchas";

/** Column order matches Supabase `Row` shapes from idea-forge types. */
export const TABLE_HEADERS: Record<CoreTableName, readonly string[]> = {
  ideas: [
    "category",
    "created_at",
    "deleted_at",
    "id",
    "key_features",
    "processed_summary",
    "raw_dump",
    "status",
    "tags",
    "title",
    "updated_at",
    "user_id",
  ],
  projects: [
    "brainstorm_id",
    "bullet_breakdown",
    "campaign_id",
    "category",
    "chat_history",
    "compiled_description",
    "created_at",
    "deleted_at",
    "execution_strategy",
    "general_notes",
    "github_repo_url",
    "id",
    "name",
    "status",
    "tags",
    "updated_at",
    "user_id",
  ],
  brainstorms: [
    "bullet_breakdown",
    "category",
    "chat_history",
    "compiled_description",
    "created_at",
    "deleted_at",
    "id",
    "idea_id",
    "status",
    "tags",
    "title",
    "updated_at",
    "user_id",
    "assistant_chat_history",
  ],
  campaigns: [
    "category",
    "chat_history",
    "created_at",
    "deleted_at",
    "id",
    "interview_completed",
    "ip_strategy",
    "marketing_links",
    "marketing_plan",
    "monetization_plan",
    "operations_plan",
    "playbook",
    "primary_channel",
    "project_id",
    "revenue",
    "sales_model",
    "status",
    "tags",
    "target_price",
    "title",
    "units_sold",
    "updated_at",
    "user_id",
    "assistant_chat_history",
  ],
  project_tasks: [
    "completed",
    "created_at",
    "description",
    "due_date",
    "id",
    "parent_task_id",
    "priority",
    "project_id",
    "sort_order",
    "title",
    "updated_at",
    "user_id",
  ],
  campaign_tasks: [
    "campaign_id",
    "completed",
    "created_at",
    "description",
    "due_date",
    "id",
    "parent_task_id",
    "priority",
    "sort_order",
    "status_column",
    "title",
    "user_id",
  ],
  gotchas: [
    "chat_history",
    "created_at",
    "id",
    "project_id",
    "root_cause",
    "status",
    "symptom",
  ],
} as const;

let cachedSpreadsheetId: string | null =
  typeof localStorage !== "undefined"
    ? localStorage.getItem(STORAGE_KEY_SPREADSHEET_ID)
    : null;

const sheetIdCache = new Map<string, Map<string, number>>();

function colIndexToLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function a1RangeForRow(
  sheetTitle: string,
  headers: readonly string[],
  row1Based: number,
): string {
  const lastCol = colIndexToLetter(headers.length - 1);
  const safe = escapeSheetName(sheetTitle);
  return `${safe}!A${row1Based}:${lastCol}${row1Based}`;
}

function a1RangeFullColumns(sheetTitle: string, headers: readonly string[]): string {
  const lastCol = colIndexToLetter(headers.length - 1);
  return `${escapeSheetName(sheetTitle)}!A:${lastCol}`;
}

function escapeSheetName(title: string): string {
  if (/[^A-Za-z0-9_]/.test(title)) {
    return `'${title.replace(/'/g, "''")}'`;
  }
  return title;
}

async function parseGoogleError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    const err = j?.error;
    if (typeof err === "string") return err;
    if (err?.message) return err.message;
    return JSON.stringify(j);
  } catch {
    return res.statusText || String(res.status);
  }
}

async function authorizedFetch(
  url: string,
  init: RequestInit,
  allowRetry: boolean,
): Promise<Response> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Not authenticated: no access token");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if ((res.status === 401 || res.status === 403) && allowRetry) {
    await handleTokenExpiration();
    await new Promise((r) => setTimeout(r, 400));
    return authorizedFetch(url, init, false);
  }
  return res;
}

function assertTableName(name: string): asserts name is CoreTableName {
  if (!(name in TABLE_HEADERS)) {
    throw new Error(`Unknown table: ${name}`);
  }
}

function getSpreadsheetIdOrThrow(): string {
  const id = cachedSpreadsheetId ?? localStorage.getItem(STORAGE_KEY_SPREADSHEET_ID);
  if (!id) {
    throw new Error("Spreadsheet not initialized; call initDatabaseSheet() first");
  }
  return id;
}

export function getSpreadsheetId(): string | null {
  return cachedSpreadsheetId ?? localStorage.getItem(STORAGE_KEY_SPREADSHEET_ID);
}

export function setSpreadsheetId(id: string | null): void {
  cachedSpreadsheetId = id;
  if (id) {
    localStorage.setItem(STORAGE_KEY_SPREADSHEET_ID, id);
  } else {
    localStorage.removeItem(STORAGE_KEY_SPREADSHEET_ID);
  }
  sheetIdCache.clear();
}

function serializeCell(value: unknown): string | boolean | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseCell(raw: string): unknown {
  const t = raw.trim();
  if (t === "TRUE" || t === "true") return true;
  if (t === "FALSE" || t === "false") return false;
  if (t === "") return null;
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function rowToObject(
  headers: readonly string[],
  row: string[],
): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    const cell = row[i] ?? "";
    o[h] = parseCell(cell);
  });
  return o;
}

function objectToRow(
  headers: readonly string[],
  obj: Record<string, unknown>,
): (string | boolean | number)[] {
  return headers.map((h) => serializeCell(obj[h]));
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a === "object" &&
    a !== null &&
    typeof b === "object" &&
    b !== null
  ) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

function rowMatchesFilter(
  row: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (!valuesEqual(row[k], v)) return false;
  }
  return true;
}

async function getSheetNumericId(
  spreadsheetId: string,
  title: string,
): Promise<number> {
  let map = sheetIdCache.get(spreadsheetId);
  if (!map) {
    map = new Map();
    sheetIdCache.set(spreadsheetId, map);
  }
  const hit = map.get(title);
  if (hit !== undefined) return hit;

  const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId%2Ctitle))`;
  const res = await authorizedFetch(url, { method: "GET" }, true);
  if (!res.ok) {
    throw new Error(
      `Failed to load spreadsheet metadata: ${res.status} ${await parseGoogleError(res)}`,
    );
  }
  const data = (await res.json()) as {
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  };
  for (const s of data.sheets ?? []) {
    const t = s.properties?.title;
    const sid = s.properties?.sheetId;
    if (t !== undefined && sid !== undefined) {
      map.set(t, sid);
    }
  }
  const id = map.get(title);
  if (id === undefined) {
    throw new Error(`Worksheet not found: ${title}`);
  }
  return id;
}

async function fetchSheetTitles(spreadsheetId: string): Promise<Set<string>> {
  const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(title))`;
  const res = await authorizedFetch(url, { method: "GET" }, true);
  if (!res.ok) {
    throw new Error(
      `Failed to load spreadsheet: ${res.status} ${await parseGoogleError(res)}`,
    );
  }
  const data = (await res.json()) as {
    sheets?: { properties?: { title?: string } }[];
  };
  return new Set(
    (data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => !!t),
  );
}

/**
 * Adds any missing worksheets from {@link TABLE_HEADERS} and writes header row 1.
 */
export async function ensureMissingWorksheets(spreadsheetId: string): Promise<void> {
  const titles = await fetchSheetTitles(spreadsheetId);
  const missing = (Object.keys(TABLE_HEADERS) as CoreTableName[]).filter(
    (name) => !titles.has(name),
  );
  if (missing.length === 0) return;

  const requests = missing.map((title) => ({
    addSheet: { properties: { title } },
  }));
  const batchUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const batchRes = await authorizedFetch(
    batchUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    },
    true,
  );
  if (!batchRes.ok) {
    throw new Error(
      `Failed to add worksheets: ${batchRes.status} ${await parseGoogleError(batchRes)}`,
    );
  }
  sheetIdCache.delete(spreadsheetId);

  const data = (
    missing.map((name) => ({
      range: `${escapeSheetName(name)}!A1:${colIndexToLetter(TABLE_HEADERS[name].length - 1)}1`,
      values: [TABLE_HEADERS[name].slice() as string[]],
    }))
  );
  const batchValuesRes = await authorizedFetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data,
      }),
    },
    true,
  );
  if (!batchValuesRes.ok) {
    throw new Error(
      `Failed to write new sheet headers: ${batchValuesRes.status} ${await parseGoogleError(batchValuesRes)}`,
    );
  }
}

const LEGACY_PROJECTS_HEADER_WITHOUT_CHAT: readonly string[] = [
  "brainstorm_id",
  "bullet_breakdown",
  "campaign_id",
  "category",
  "compiled_description",
  "created_at",
  "deleted_at",
  "execution_strategy",
  "general_notes",
  "github_repo_url",
  "id",
  "name",
  "status",
  "tags",
  "updated_at",
  "user_id",
];

/**
 * Inserts the `chat_history` column on `projects` when upgrading spreadsheets created before it existed.
 */
const LEGACY_BRAINSTORM_HEADER_WITHOUT_ASSISTANT: readonly string[] = [
  "bullet_breakdown",
  "category",
  "chat_history",
  "compiled_description",
  "created_at",
  "deleted_at",
  "id",
  "idea_id",
  "status",
  "tags",
  "title",
  "updated_at",
  "user_id",
];

/**
 * Appends `assistant_chat_history` for the floating assistant widget on legacy sheets.
 */
export async function migrateBrainstormAssistantChatColumn(
  spreadsheetId: string,
): Promise<void> {
  const range = `${escapeSheetName("brainstorms")}!A1:ZZ1`;
  const getUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const getRes = await authorizedFetch(getUrl, { method: "GET" }, true);
  if (!getRes.ok) return;
  const json = (await getRes.json()) as { values?: string[][] };
  const row = json.values?.[0];
  if (!row || row.includes("assistant_chat_history")) return;

  const legacy = LEGACY_BRAINSTORM_HEADER_WITHOUT_ASSISTANT;
  if (row.length !== legacy.length || row.some((c, i) => c !== legacy[i])) {
    return;
  }

  const sheetId = await getSheetNumericId(spreadsheetId, "brainstorms");
  const batchUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const insRes = await authorizedFetch(
    batchUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: "COLUMNS",
                startIndex: 13,
                endIndex: 14,
              },
            },
          },
        ],
      }),
    },
    true,
  );
  if (!insRes.ok) {
    throw new Error(
      `migrate brainstorm assistant column: ${insRes.status} ${await parseGoogleError(insRes)}`,
    );
  }
  sheetIdCache.delete(spreadsheetId);

  const cellRange = `${escapeSheetName("brainstorms")}!N1`;
  const putUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`;
  const putRes = await authorizedFetch(
    putUrl,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [["assistant_chat_history"]] }),
    },
    true,
  );
  if (!putRes.ok) {
    throw new Error(
      `migrate brainstorm header cell: ${putRes.status} ${await parseGoogleError(putRes)}`,
    );
  }
}

export async function migrateProjectsChatHistoryColumn(
  spreadsheetId: string,
): Promise<void> {
  const range = `${escapeSheetName("projects")}!A1:ZZ1`;
  const getUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const getRes = await authorizedFetch(getUrl, { method: "GET" }, true);
  if (!getRes.ok) return;
  const json = (await getRes.json()) as { values?: string[][] };
  const row = json.values?.[0];
  if (!row || row.includes("chat_history")) return;

  const legacy = LEGACY_PROJECTS_HEADER_WITHOUT_CHAT;
  if (row.length !== legacy.length || row.some((c, i) => c !== legacy[i])) {
    return;
  }

  const sheetId = await getSheetNumericId(spreadsheetId, "projects");
  const batchUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const insRes = await authorizedFetch(
    batchUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: "COLUMNS",
                startIndex: 4,
                endIndex: 5,
              },
            },
          },
        ],
      }),
    },
    true,
  );
  if (!insRes.ok) {
    throw new Error(
      `migrate projects column: ${insRes.status} ${await parseGoogleError(insRes)}`,
    );
  }
  sheetIdCache.delete(spreadsheetId);

  const cellRange = `${escapeSheetName("projects")}!E1`;
  const putUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`;
  const putRes = await authorizedFetch(
    putUrl,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [["chat_history"]] }),
    },
    true,
  );
  if (!putRes.ok) {
    throw new Error(
      `migrate projects header cell: ${putRes.status} ${await parseGoogleError(putRes)}`,
    );
  }
}

/**
 * Call after {@link initDatabaseSheet} sets the spreadsheet id. Adds missing tabs and migrates `projects.chat_history`.
 */
const LEGACY_CAMPAIGN_HEADER_WITHOUT_ASSISTANT: readonly string[] = [
  "category",
  "chat_history",
  "created_at",
  "deleted_at",
  "id",
  "interview_completed",
  "ip_strategy",
  "marketing_links",
  "marketing_plan",
  "monetization_plan",
  "operations_plan",
  "playbook",
  "primary_channel",
  "project_id",
  "revenue",
  "sales_model",
  "status",
  "tags",
  "target_price",
  "title",
  "units_sold",
  "updated_at",
  "user_id",
];

/**
 * Appends `assistant_chat_history` for post-interview campaign assistant on legacy sheets.
 */
export async function migrateCampaignAssistantChatColumn(
  spreadsheetId: string,
): Promise<void> {
  const range = `${escapeSheetName("campaigns")}!A1:ZZ1`;
  const getUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const getRes = await authorizedFetch(getUrl, { method: "GET" }, true);
  if (!getRes.ok) return;
  const json = (await getRes.json()) as { values?: string[][] };
  const row = json.values?.[0];
  if (!row || row.includes("assistant_chat_history")) return;

  const legacy = LEGACY_CAMPAIGN_HEADER_WITHOUT_ASSISTANT;
  if (row.length !== legacy.length || row.some((c, i) => c !== legacy[i])) {
    return;
  }

  const sheetId = await getSheetNumericId(spreadsheetId, "campaigns");
  const batchUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const insRes = await authorizedFetch(
    batchUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: "COLUMNS",
                startIndex: 23,
                endIndex: 24,
              },
            },
          },
        ],
      }),
    },
    true,
  );
  if (!insRes.ok) {
    throw new Error(
      `migrate campaigns assistant column: ${insRes.status} ${await parseGoogleError(insRes)}`,
    );
  }
  sheetIdCache.delete(spreadsheetId);

  const cellRange = `${escapeSheetName("campaigns")}!X1`;
  const putUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`;
  const putRes = await authorizedFetch(
    putUrl,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [["assistant_chat_history"]] }),
    },
    true,
  );
  if (!putRes.ok) {
    throw new Error(
      `migrate campaigns header cell: ${putRes.status} ${await parseGoogleError(putRes)}`,
    );
  }
}

export async function ensureDatabaseSchema(): Promise<void> {
  const spreadsheetId = getSpreadsheetIdOrThrow();
  await ensureMissingWorksheets(spreadsheetId);
  await migrateProjectsChatHistoryColumn(spreadsheetId);
  await migrateBrainstormAssistantChatColumn(spreadsheetId);
  await migrateCampaignAssistantChatColumn(spreadsheetId);
}

/**
 * Ensures a spreadsheet named {@link DB_SPREADSHEET_TITLE} exists and has core worksheets + headers.
 */
export async function initDatabaseSheet(): Promise<{ spreadsheetId: string }> {
  const q = encodeURIComponent(
    `name='${DB_SPREADSHEET_TITLE.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
  );
  const listUrl = `${DRIVE_FILES_URL}?q=${q}&fields=${encodeURIComponent("files(id,name)")}&pageSize=10&spaces=drive`;
  const listRes = await authorizedFetch(listUrl, { method: "GET" }, true);
  if (!listRes.ok) {
    throw new Error(
      `Drive files.list failed: ${listRes.status} ${await parseGoogleError(listRes)}`,
    );
  }
  const listJson = (await listRes.json()) as { files?: { id: string; name: string }[] };
  const files = listJson.files ?? [];
  if (files.length > 1) {
    console.warn(
      `Multiple spreadsheets named ${DB_SPREADSHEET_TITLE}; using the first (${files[0].id})`,
    );
  }

  let spreadsheetId: string;

  if (files.length > 0) {
    spreadsheetId = files[0].id;
  } else {
    const createBody = {
      properties: { title: DB_SPREADSHEET_TITLE },
      sheets: (
        [
          "ideas",
          "projects",
          "brainstorms",
          "campaigns",
          "project_tasks",
          "campaign_tasks",
          "gotchas",
        ] as CoreTableName[]
      ).map((title) => ({
        properties: { title },
      })),
    };
    const createRes = await authorizedFetch(
      SHEETS_API,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createBody),
      },
      true,
    );
    if (!createRes.ok) {
      throw new Error(
        `Failed to create spreadsheet: ${createRes.status} ${await parseGoogleError(createRes)}`,
      );
    }
    const created = (await createRes.json()) as { spreadsheetId: string };
    spreadsheetId = created.spreadsheetId;

    const data = (
      Object.entries(TABLE_HEADERS) as [CoreTableName, readonly string[]][]
    ).map(([name, headers]) => ({
      range: `${escapeSheetName(name)}!A1:${colIndexToLetter(headers.length - 1)}1`,
      values: [headers.slice()],
    }));

    const batchRes = await authorizedFetch(
      `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data,
        }),
      },
      true,
    );
    if (!batchRes.ok) {
      throw new Error(
        `Failed to write headers: ${batchRes.status} ${await parseGoogleError(batchRes)}`,
      );
    }
  }

  cachedSpreadsheetId = spreadsheetId;
  localStorage.setItem(STORAGE_KEY_SPREADSHEET_ID, spreadsheetId);
  sheetIdCache.delete(spreadsheetId);

  await ensureDatabaseSchema();

  return { spreadsheetId };
}

/**
 * Read data rows from a worksheet. Row 1 must be headers.
 * Optional filter: every key must match the row (same rules as parsed cell values).
 */
export async function getRows(
  tableName: string,
  filter?: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  assertTableName(tableName);
  const spreadsheetId = getSpreadsheetIdOrThrow();
  const headers = TABLE_HEADERS[tableName];
  const range = `${escapeSheetName(tableName)}!A:ZZ`;
  const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const res = await authorizedFetch(url, { method: "GET" }, true);
  if (!res.ok) {
    throw new Error(
      `getRows failed: ${res.status} ${await parseGoogleError(res)}`,
    );
  }
  const json = (await res.json()) as { values?: string[][] };
  const values = json.values ?? [];
  if (values.length === 0) return [];
  const headerRow = values[0];
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < values.length; i++) {
    const obj = rowToObject(headerRow, values[i]);
    if (!filter || rowMatchesFilter(obj, filter)) {
      rows.push(obj);
    }
  }
  return rows;
}

/**
 * Append a row. Generates `id` via `crypto.randomUUID()` when missing.
 */
export async function insertRow(
  tableName: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertTableName(tableName);
  const spreadsheetId = getSpreadsheetIdOrThrow();
  const headers = TABLE_HEADERS[tableName];
  const row: Record<string, unknown> = { ...data };
  if (row.id === undefined || row.id === null || row.id === "") {
    row.id = crypto.randomUUID();
  }
  const range = a1RangeFullColumns(tableName, headers);
  const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await authorizedFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [objectToRow(headers, row)] }),
    },
    true,
  );
  if (!res.ok) {
    throw new Error(
      `insertRow failed: ${res.status} ${await parseGoogleError(res)}`,
    );
  }
  return row;
}

/**
 * Update the row whose `id` column matches. Merges `data` onto the existing row.
 */
export async function updateRow(
  tableName: string,
  id: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertTableName(tableName);
  const spreadsheetId = getSpreadsheetIdOrThrow();
  const headers = TABLE_HEADERS[tableName];
  const idCol = headers.indexOf("id");
  if (idCol < 0) throw new Error("Table has no id column");

  const range = `${escapeSheetName(tableName)}!A:ZZ`;
  const getUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const getRes = await authorizedFetch(getUrl, { method: "GET" }, true);
  if (!getRes.ok) {
    throw new Error(
      `updateRow read failed: ${getRes.status} ${await parseGoogleError(getRes)}`,
    );
  }
  const json = (await getRes.json()) as { values?: string[][] };
  const values = json.values ?? [];
  if (values.length < 2) {
    throw new Error(`No rows to update in ${tableName}`);
  }
  const headerRow = values[0];
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    const cell = values[i][idCol] ?? "";
    if (parseCell(cell) === id || String(cell) === id) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex < 0) {
    throw new Error(`No row with id=${id} in ${tableName}`);
  }
  const existing = rowToObject(headerRow, values[rowIndex]);
  const merged = { ...existing, ...data, id };
  const sheetRow1Based = rowIndex + 1;
  const updateRange = a1RangeForRow(tableName, headers, sheetRow1Based);
  const putUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`;
  const putRes = await authorizedFetch(
    putUrl,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [objectToRow(headers, merged)] }),
    },
    true,
  );
  if (!putRes.ok) {
    throw new Error(
      `updateRow failed: ${putRes.status} ${await parseGoogleError(putRes)}`,
    );
  }
  return merged;
}

/**
 * Delete the row whose `id` column matches (not the header row).
 */
export async function deleteRow(tableName: string, id: string): Promise<void> {
  assertTableName(tableName);
  const spreadsheetId = getSpreadsheetIdOrThrow();
  const headers = TABLE_HEADERS[tableName];
  const idCol = headers.indexOf("id");
  if (idCol < 0) throw new Error("Table has no id column");

  const range = `${escapeSheetName(tableName)}!A:ZZ`;
  const getUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  const getRes = await authorizedFetch(getUrl, { method: "GET" }, true);
  if (!getRes.ok) {
    throw new Error(
      `deleteRow read failed: ${getRes.status} ${await parseGoogleError(getRes)}`,
    );
  }
  const json = (await getRes.json()) as { values?: string[][] };
  const values = json.values ?? [];
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    const cell = values[i][idCol] ?? "";
    if (parseCell(cell) === id || String(cell) === id) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex < 0) {
    throw new Error(`No row with id=${id} in ${tableName}`);
  }

  const sheetId = await getSheetNumericId(spreadsheetId, tableName);
  const batchUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const batchRes = await authorizedFetch(
    batchUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          },
        ],
      }),
    },
    true,
  );
  if (!batchRes.ok) {
    throw new Error(
      `deleteRow failed: ${batchRes.status} ${await parseGoogleError(batchRes)}`,
    );
  }
}
