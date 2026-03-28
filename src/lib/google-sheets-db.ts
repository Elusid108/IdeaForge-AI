/**
 * Google Sheets-backed data access layer (Drive + Sheets REST via fetch).
 * Uses the same OAuth token as {@link @/lib/google-api} / AuthContext.
 */

import {
  getAccessToken,
  handleTokenExpiration,
  loadGapi,
} from "@/lib/google-api";
import { DRIVE_FILE_SCOPE } from "@/lib/google-config";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const DB_SPREADSHEET_TITLE = "IdeaForge_DB";
/** My Drive root folder for the database spreadsheet (visible in Drive). */
const DATA_FOLDER_NAME = "IdeaForge AI Data";
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

function driveApiErrorMessage(error: unknown): string {
  const e = error as {
    result?: { error?: { message?: string } };
    message?: string;
  };
  return e?.result?.error?.message ?? e?.message ?? String(error);
}

/** Minimal Drive v3 `files` list item for strict typing. */
interface DriveFileListItem {
  id?: string;
  name?: string;
}

interface DriveFilesListResult {
  files?: DriveFileListItem[];
}

interface DriveFileCreateResult {
  id?: string;
}

let cachedDataFolderId: string | null = null;
let dataFolderCreationLock: Promise<string> | null = null;

/** True if the access token includes {@link DRIVE_FILE_SCOPE} (via OAuth2 tokeninfo). */
async function tokenHasDriveFileScope(accessToken: string): Promise<boolean> {
  try {
    const url = new URL("https://www.googleapis.com/oauth2/v1/tokeninfo");
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url.toString());
    if (!res.ok) return false;
    const data = (await res.json()) as { scope?: string; error?: string };
    if (data.error) return false;
    const scopes = (data.scope ?? "").split(/\s+/).filter(Boolean);
    return scopes.includes(DRIVE_FILE_SCOPE);
  } catch {
    return false;
  }
}

function isInsufficientDrivePermissionMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("insufficient authentication scopes") ||
    m.includes("insufficient permission") ||
    m.includes("access not granted") ||
    m.includes("request had insufficient authentication scopes")
  );
}

async function driveListFoldersInRoot(
  allowRetry: boolean,
): Promise<DriveFileListItem[]> {
  const escaped = DATA_FOLDER_NAME.replace(/'/g, "\\'");
  const q = `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  try {
    const response = await gapi.client.drive.files.list({
      q,
      fields: "files(id,name)",
      pageSize: 10,
    });
    const result = response.result as DriveFilesListResult;
    return result.files ?? [];
  } catch (error: unknown) {
    const err = error as { status?: number };
    if ((err.status === 401 || err.status === 403) && allowRetry) {
      await handleTokenExpiration();
      const token = getAccessToken();
      if (!token) throw new Error("Not authenticated: no access token");
      gapi.client.setToken({ access_token: token });
      await new Promise((r) => setTimeout(r, 400));
      return driveListFoldersInRoot(false);
    }
    throw new Error(`Drive files.list (folder) failed: ${driveApiErrorMessage(error)}`);
  }
}

async function driveCreateDataFolder(allowRetry: boolean): Promise<string> {
  try {
    const response = await gapi.client.drive.files.create({
      resource: {
        name: DATA_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
        parents: ["root"],
      },
      fields: "id",
    });
    const result = response.result as DriveFileCreateResult;
    const id = result.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("Drive files.create (folder) returned no id");
    }
    return id;
  } catch (error: unknown) {
    const err = error as { status?: number };
    if ((err.status === 401 || err.status === 403) && allowRetry) {
      await handleTokenExpiration();
      const token = getAccessToken();
      if (!token) throw new Error("Not authenticated: no access token");
      gapi.client.setToken({ access_token: token });
      await new Promise((r) => setTimeout(r, 400));
      return driveCreateDataFolder(false);
    }
    throw new Error(
      `Drive files.create (folder) failed: ${driveApiErrorMessage(error)}`,
    );
  }
}

/**
 * Resolves the "IdeaForge AI Data" folder in My Drive root (creates if missing).
 * Serialized with a mutex so concurrent inits do not create duplicate folders.
 */
async function ensureDataFolderId(allowRetry: boolean): Promise<string> {
  if (cachedDataFolderId) {
    return cachedDataFolderId;
  }
  if (dataFolderCreationLock) {
    await dataFolderCreationLock;
    if (cachedDataFolderId) {
      return cachedDataFolderId;
    }
    throw new Error("IdeaForge data folder initialization did not complete");
  }

  dataFolderCreationLock = (async () => {
    try {
      const items = await driveListFoldersInRoot(allowRetry);
      let folderId: string | undefined;
      for (const f of items) {
        if (typeof f.id === "string" && f.id.length > 0) {
          folderId = f.id;
          break;
        }
      }
      if (!folderId) {
        folderId = await driveCreateDataFolder(allowRetry);
      }
      cachedDataFolderId = folderId;
      return folderId;
    } finally {
      dataFolderCreationLock = null;
    }
  })();

  return dataFolderCreationLock;
}

async function listDatabaseSpreadsheetsInFolder(
  folderId: string,
  allowRetry: boolean,
): Promise<{ id: string; name: string }[]> {
  const escapedTitle = DB_SPREADSHEET_TITLE.replace(/'/g, "\\'");
  const q = `name='${escapedTitle}' and '${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  try {
    const response = await gapi.client.drive.files.list({
      q,
      fields: "files(id,name)",
      pageSize: 10,
    });
    const result = response.result as DriveFilesListResult;
    const raw = result.files ?? [];
    const files: { id: string; name: string }[] = [];
    for (const f of raw) {
      const id = f.id;
      if (typeof id === "string" && id.length > 0) {
        const name = typeof f.name === "string" ? f.name : "";
        files.push({ id, name });
      }
    }
    return files;
  } catch (error: unknown) {
    const err = error as { status?: number };
    if ((err.status === 401 || err.status === 403) && allowRetry) {
      await handleTokenExpiration();
      const token = getAccessToken();
      if (!token) throw new Error("Not authenticated: no access token");
      gapi.client.setToken({ access_token: token });
      await new Promise((r) => setTimeout(r, 400));
      return listDatabaseSpreadsheetsInFolder(folderId, false);
    }
    throw new Error(`Drive files.list failed: ${driveApiErrorMessage(error)}`);
  }
}

async function createDatabaseSpreadsheet(
  folderId: string,
  allowRetry: boolean,
): Promise<string> {
  try {
    const response = await gapi.client.drive.files.create({
      resource: {
        name: DB_SPREADSHEET_TITLE,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [folderId],
      },
      fields: "id",
    });
    const result = response.result as DriveFileCreateResult;
    const id = result.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("Drive files.create returned no id");
    }
    return id;
  } catch (error: unknown) {
    const err = error as { status?: number };
    if ((err.status === 401 || err.status === 403) && allowRetry) {
      await handleTokenExpiration();
      const token = getAccessToken();
      if (!token) throw new Error("Not authenticated: no access token");
      gapi.client.setToken({ access_token: token });
      await new Promise((r) => setTimeout(r, 400));
      return createDatabaseSpreadsheet(folderId, false);
    }
    throw new Error(`Drive files.create failed: ${driveApiErrorMessage(error)}`);
  }
}

/** Removes the default tab left by Drive `files.create` after core worksheets exist. */
async function deleteWorksheetByTitleIfExists(
  spreadsheetId: string,
  title: string,
): Promise<void> {
  const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId%2Ctitle))`;
  const res = await authorizedFetch(url, { method: "GET" }, true);
  if (!res.ok) return;
  const data = (await res.json()) as {
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  };
  const sheet = (data.sheets ?? []).find((s) => s.properties?.title === title);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined) return;

  const batchUrl = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const batchRes = await authorizedFetch(
    batchUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{ deleteSheet: { sheetId } }],
      }),
    },
    true,
  );
  if (!batchRes.ok) {
    throw new Error(
      `Failed to delete worksheet ${title}: ${batchRes.status} ${await parseGoogleError(batchRes)}`,
    );
  }
  sheetIdCache.delete(spreadsheetId);
}

/**
 * Ensures {@link DB_SPREADSHEET_TITLE} exists under the "IdeaForge AI Data" folder in My Drive and has core worksheets + headers.
 */
export async function initDatabaseSheet(): Promise<{ spreadsheetId: string }> {
  try {
    await loadGapi();
    const token = getAccessToken();
    if (!token) {
      throw new Error("Not authenticated: no access token");
    }

    const hasDriveFileScope = await tokenHasDriveFileScope(token);
    if (!hasDriveFileScope) {
      console.warn(
        "[IdeaForge DB] Access token is missing drive.file scope. Sign out and sign in again (with consent) to open your database.",
      );
      throw new Error(
        "Google Drive file access is missing. Please sign out and sign in again to grant access to your IdeaForge database.",
      );
    }

    gapi.client.setToken({ access_token: token });

    let folderId: string;
    try {
      folderId = await ensureDataFolderId(true);
    } catch (folderErr: unknown) {
      const msg =
        folderErr instanceof Error ? folderErr.message : String(folderErr);
      throw new Error(`Could not prepare IdeaForge data folder: ${msg}`);
    }

    let files: { id: string; name: string }[];
    try {
      files = await listDatabaseSpreadsheetsInFolder(folderId, true);
    } catch (listErr: unknown) {
      const msg = listErr instanceof Error ? listErr.message : String(listErr);
      throw new Error(`Could not list database spreadsheet: ${msg}`);
    }

    if (files.length > 1) {
      console.warn(
        `Multiple spreadsheets named ${DB_SPREADSHEET_TITLE}; using the first (${files[0].id})`,
      );
    }

    let spreadsheetId: string;
    try {
      spreadsheetId =
        files.length > 0
          ? files[0].id
          : await createDatabaseSpreadsheet(folderId, true);
    } catch (sheetErr: unknown) {
      const msg = sheetErr instanceof Error ? sheetErr.message : String(sheetErr);
      throw new Error(`Could not create or open database spreadsheet: ${msg}`);
    }

    setSpreadsheetId(spreadsheetId);

    await ensureDatabaseSchema();
    await deleteWorksheetByTitleIfExists(spreadsheetId, "Sheet1");

    return { spreadsheetId };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      /403|forbidden/i.test(msg) ||
      isInsufficientDrivePermissionMessage(msg)
    ) {
      console.warn(
        "[IdeaForge DB] Google Drive refused the request (permission). If OAuth scopes were updated, sign out and sign in again.",
        msg,
      );
    }
    throw e instanceof Error ? e : new Error(msg);
  }
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
