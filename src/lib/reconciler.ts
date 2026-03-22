/*
 * Copyright 2026 Christopher Moore
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Reconciler Module — Drive orphan cleanup and page shape normalization (Strata-compatible tree).

import * as GoogleAPI from "./google-api";

type NotebookData = {
  notebooks?: Array<{
    driveFolderId?: string;
    tabs?: Array<{
      driveFolderId?: string;
      pages?: Array<{
        driveFileId?: string;
        driveShortcutId?: string;
        driveLinkFileId?: string;
      }>;
    }>;
  }>;
};

/**
 * Extract all known Drive IDs from the app's data structure
 */
const collectKnownDriveIds = (data: NotebookData | null | undefined): Set<string> => {
  const ids = new Set<string>();
  if (!data?.notebooks) return ids;

  for (const notebook of data.notebooks) {
    if (notebook.driveFolderId) ids.add(notebook.driveFolderId);

    for (const tab of notebook.tabs || []) {
      if (tab.driveFolderId) ids.add(tab.driveFolderId);

      for (const page of tab.pages || []) {
        if (page.driveFileId) ids.add(page.driveFileId);
        if (page.driveShortcutId) ids.add(page.driveShortcutId);
        if (page.driveLinkFileId) ids.add(page.driveLinkFileId);
      }
    }
  }

  return ids;
};

const getTrashFolderId = async (rootFolderId: string): Promise<string> => {
  try {
    const rootItems = await GoogleAPI.listFolderContents(rootFolderId);
    const trashFolder = rootItems.find((item) => item.name === "_STRATA_TRASH");

    if (trashFolder) {
      return trashFolder.id;
    }

    const newTrashFolder = await GoogleAPI.createDriveFolder("_STRATA_TRASH", rootFolderId);
    return newTrashFolder.id;
  } catch (error) {
    console.error("Error getting trash folder:", error);
    throw error;
  }
};

const SPECIAL_NAMES = new Set([
  "_STRATA_TRASH",
  "strata_structure.json",
  "strata_index.json",
  "manifest.json",
  "index.html",
]);

const cleanupOrphans = async (data: NotebookData, rootFolderId: string): Promise<void> => {
  try {
    console.log("=== Starting Orphan Cleanup ===");

    const knownIds = collectKnownDriveIds(data);
    console.log(`Known Drive IDs: ${knownIds.size}`);

    const rootItems = await GoogleAPI.listFolderContents(rootFolderId);

    let orphanCount = 0;
    let trashFolderId: string | null = null;

    for (const item of rootItems) {
      if (SPECIAL_NAMES.has(item.name)) continue;
      if (knownIds.has(item.id)) continue;

      console.log(`Orphan found in root: ${item.name} (${item.id})`);

      if (!trashFolderId) {
        trashFolderId = await getTrashFolderId(rootFolderId);
        if (item.id === trashFolderId) continue;
      }
      if (item.id === trashFolderId) continue;

      try {
        await GoogleAPI.moveDriveItem(item.id, trashFolderId, rootFolderId);
        orphanCount++;
        console.log(`Moved orphan "${item.name}" to _STRATA_TRASH`);
      } catch (error) {
        console.error(`Error moving orphan ${item.id}:`, error);
      }
    }

    console.log(`=== Orphan Cleanup Complete: ${orphanCount} orphans moved ===`);
  } catch (error: unknown) {
    console.error("Error in cleanupOrphans:", error);
    const err = error as { status?: number; message?: string };
    if (err.status === 401 || err.message?.includes("Authentication")) {
      try {
        await GoogleAPI.handleTokenExpiration();
      } catch (authError) {
        console.error("Token refresh failed:", authError);
      }
    }
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reconcilePage = (page: any) => {
  if (!page) return page;
  if (page.type !== "mermaid" && page.type !== "code") return page;
  const codeVal = page.code ?? page.mermaidCode ?? page.codeContent ?? "";
  return {
    ...page,
    code: codeVal,
    mermaidCode: page.mermaidCode ?? (page.codeType === "mermaid" ? codeVal : ""),
    codeType: page.codeType || "mermaid",
    mermaidViewport: page.mermaidViewport || { x: 0, y: 0, scale: 1 },
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reconcileData = (data: any) => {
  if (!data?.notebooks) return data;
  return {
    ...data,
    notebooks: data.notebooks.map((nb: { tabs?: unknown[] }) => ({
      ...nb,
      tabs: (nb.tabs || []).map((tab: { pages?: unknown[] }) => ({
        ...tab,
        pages: (tab.pages || []).map(reconcilePage),
      })),
    })),
  };
};

export { cleanupOrphans, collectKnownDriveIds, reconcilePage, reconcileData };

export default { cleanupOrphans, collectKnownDriveIds, reconcilePage, reconcileData };
