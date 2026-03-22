import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { APP_VERSION } from "@/lib/appVersion";
import { log } from "@/lib/syncLogger";
import * as GoogleAPI from "@/lib/google-api";
import { generateOfflineViewerHtml } from "@/lib/offline-viewer";
import { reconcileData } from "@/lib/reconciler";

export type ShowNotification = (message: string, type: "success" | "error" | "info") => void;

/**
 * Google Drive sync for Strata-shaped notebook data. Authentication comes from {@link useAuth} — use `signIn` / `signOut` on the auth context, not this hook.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useGoogleDrive(data: any, setData: any, showNotification?: ShowNotification) {
  const { user, loading: isLoadingAuth } = useAuth();
  const isAuthenticated = !!user;
  const userEmail = user?.email ?? null;
  const userName = user?.name ?? user?.given_name ?? user?.email ?? null;

  // Drive sync state
  const [driveRootFolderId, setDriveRootFolderId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  
  // Structure version for triggering sync
  const [structureVersion, setStructureVersion] = useState(0);
  
  // Content sync version for triggering content sync retries
  const [contentSyncVersion, setContentSyncVersion] = useState(0);
  
  const [hasInitialLoadCompleted, setHasInitialLoadCompleted] = useState(false);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);
  
  // Sync lock refs
  const syncLockRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const lastContentSyncRef = useRef(Date.now());
  
  // Pending Drive deletes queue
  const pendingDriveDeletesRef = useRef<string[]>([]);
  
  // Pending content sync flag
  const pendingContentSyncRef = useRef(false);
  
  const dirtyPagesRef = useRef(new Set<string>());

  // Ref for structure sync to read current data without triggering effect on every data change
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Initialize Drive root folder
  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth) return;

    const initDriveSync = async () => {
      try {
        setIsSyncing(true);
        const rootFolderId = await GoogleAPI.getOrCreateRootFolder();
        setDriveRootFolderId(rootFolderId);
        setLastSyncTime(Date.now());
      } catch (error) {
        log('ERROR', 'Error initializing Drive sync:', error);
      } finally {
        setIsSyncing(false);
      }
    };

    initDriveSync();
  }, [isAuthenticated, isLoadingAuth]);

  // Orphan cleanup disabled - was causing data loss when app loaded from stale cache.
  // Will be reimplemented as a manual settings button in a future update.
  // useEffect(() => { ... cleanupOrphans ... }, [...]);

  // Queue a Drive item for deletion during next structure sync
  const queueDriveDelete = useCallback((driveIds) => {
    // driveIds can be a single string or array of { type, driveId } objects
    if (!driveIds) return;
    const items = Array.isArray(driveIds) ? driveIds : [driveIds];
    for (const item of items) {
      const id = typeof item === 'string' ? item : item.driveId;
      if (id) {
        pendingDriveDeletesRef.current.push(id);
      }
    }
  }, []);

  // Move an item physically in Google Drive
  const moveItemInDrive = useCallback(async (itemId, newParentId, oldParentId) => {
    if (!isAuthenticated || !itemId || !newParentId || !oldParentId) return;
    try {
      await GoogleAPI.moveDriveItem(itemId, newParentId, oldParentId);
      log('SYNC', `Moved item ${itemId} from ${oldParentId} to ${newParentId}`);
    } catch (error) {
      log('ERROR', 'Error moving item in Drive:', error);
    }
  }, [isAuthenticated]);

  // Sync folder structure to Drive (uses dataRef to avoid re-running on every data change)
  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth || !driveRootFolderId || !hasInitialLoadCompleted) return;
    const currentData = dataRef.current;
    if (!currentData?.notebooks) return;

    const syncStructure = async () => {
      if (syncLockRef.current) {
        log('SYNC', 'structure sync: lock held, deferring');
        pendingSyncRef.current = true;
        return;
      }
      syncLockRef.current = true;
      const dataToSync = dataRef.current;
      log('SYNC', 'structure sync: start', { notebookCount: dataToSync?.notebooks?.length });
      
      try {
        setIsSyncing(true);

        // Drain pending deletes queue
        if (pendingDriveDeletesRef.current.length > 0) {
          const deletesToProcess = [...pendingDriveDeletesRef.current];
          pendingDriveDeletesRef.current = [];
          for (const driveId of deletesToProcess) {
            try {
              await GoogleAPI.deleteDriveItem(driveId);
            } catch (error) {
              log('ERROR', `Error deleting Drive item ${driveId}:`, error);
            }
          }
        }

        const driveIdUpdates = {};

        // Sync each notebook
        for (const notebook of dataToSync.notebooks) {
          let notebookFolderId;
          if (!notebook.driveFolderId) {
            try {
              notebookFolderId = await GoogleAPI.getOrCreateFolder(notebook.name, driveRootFolderId);
              driveIdUpdates[notebook.id] = { driveFolderId: notebookFolderId };
            } catch (error) {
              log('ERROR', `Error creating folder for notebook ${notebook.name}:`, error);
              continue;
            }
          } else {
            try {
              notebookFolderId = await GoogleAPI.saveFolderIdempotent(notebook.driveFolderId, notebook.name, driveRootFolderId, { icon: notebook.icon });
            } catch (error) {
              log('ERROR', `Error updating notebook folder ${notebook.name}:`, error);
              notebookFolderId = notebook.driveFolderId;
            }
          }

          if (!notebookFolderId) continue;

          // Sync tabs
          for (const tab of notebook.tabs) {
            let tabFolderId;
            if (!tab.driveFolderId) {
              try {
                tabFolderId = await GoogleAPI.getOrCreateFolder(tab.name, notebookFolderId);
                if (!driveIdUpdates[notebook.id]) driveIdUpdates[notebook.id] = { tabs: {} };
                if (!driveIdUpdates[notebook.id].tabs) driveIdUpdates[notebook.id].tabs = {};
                driveIdUpdates[notebook.id].tabs[tab.id] = { driveFolderId: tabFolderId };
              } catch (error) {
                log('ERROR', `Error creating folder for tab ${tab.name}:`, error);
                continue;
              }
            } else {
              try {
                tabFolderId = await GoogleAPI.saveFolderIdempotent(tab.driveFolderId, tab.name, notebookFolderId, { icon: tab.icon, tabColor: tab.color });
              } catch (error) {
                log('ERROR', `Error updating tab folder ${tab.name}:`, error);
                tabFolderId = tab.driveFolderId;
              }
            }

            if (!tabFolderId) continue;

            // Sync pages
            for (const page of tab.pages) {
              const pageType = page.type || 'block';
              const isGooglePage = ['doc', 'sheet', 'slide', 'form', 'drawing', 'vid', 'pdf', 'map', 'site', 'script', 'drive'].includes(pageType);
              
              if (isGooglePage || page.embedUrl) {
                if (!page.driveLinkFileId) {
                  try {
                    const fileId = await GoogleAPI.syncGooglePageLink(page, tabFolderId);
                    if (!driveIdUpdates[notebook.id]) driveIdUpdates[notebook.id] = { tabs: {} };
                    if (!driveIdUpdates[notebook.id].tabs) driveIdUpdates[notebook.id].tabs = {};
                    if (!driveIdUpdates[notebook.id].tabs[tab.id]) driveIdUpdates[notebook.id].tabs[tab.id] = { pages: {} };
                    if (!driveIdUpdates[notebook.id].tabs[tab.id].pages) driveIdUpdates[notebook.id].tabs[tab.id].pages = {};
                    driveIdUpdates[notebook.id].tabs[tab.id].pages[page.id] = { driveLinkFileId: fileId };
                  } catch (error) {
                    log('ERROR', `Error creating link file for page ${page.name}:`, error);
                  }
                } else {
                  try {
                    await GoogleAPI.updateFileProperties(page.driveLinkFileId, { icon: page.icon, pageType: pageType });
                  } catch (error) {
                    log('ERROR', `Error updating page properties ${page.name}:`, error);
                  }
                }
              } else if (!page.driveFileId) {
                try {
                  const fileId = await GoogleAPI.syncPageToDrive(page, tabFolderId);
                  if (!driveIdUpdates[notebook.id]) driveIdUpdates[notebook.id] = { tabs: {} };
                  if (!driveIdUpdates[notebook.id].tabs) driveIdUpdates[notebook.id].tabs = {};
                  if (!driveIdUpdates[notebook.id].tabs[tab.id]) driveIdUpdates[notebook.id].tabs[tab.id] = { pages: {} };
                  if (!driveIdUpdates[notebook.id].tabs[tab.id].pages) driveIdUpdates[notebook.id].tabs[tab.id].pages = {};
                  driveIdUpdates[notebook.id].tabs[tab.id].pages[page.id] = { driveFileId: fileId };
                } catch (error) {
                  log('ERROR', `Error creating file for page ${page.name}:`, error);
                }
              } else {
                try {
                  await GoogleAPI.updateFileProperties(page.driveFileId, { icon: page.icon, pageType: pageType });
                } catch (error) {
                  log('ERROR', `Error updating page properties ${page.name}:`, error);
                }
              }
            }
          }
        }

        // Apply drive ID updates
        if (Object.keys(driveIdUpdates).length > 0) {
          log('SYNC', 'structure sync: applying driveIdUpdates', { driveIdUpdates });
          setData(prev => {
            const next = { ...prev, notebooks: prev.notebooks.map(notebook => {
              const nbUpdate = driveIdUpdates[notebook.id];
              if (!nbUpdate) return notebook;
              
              return {
                ...notebook,
                driveFolderId: nbUpdate.driveFolderId || notebook.driveFolderId,
                tabs: notebook.tabs.map(tab => {
                  const tabUpdate = nbUpdate.tabs?.[tab.id];
                  if (!tabUpdate) return tab;
                  
                  return {
                    ...tab,
                    driveFolderId: tabUpdate.driveFolderId || tab.driveFolderId,
                    pages: tab.pages.map(page => {
                      const pageUpdate = tabUpdate.pages?.[page.id];
                      if (!pageUpdate) return page;
                      
                      return {
                        ...page,
                        driveFileId: pageUpdate.driveFileId || page.driveFileId,
                        driveShortcutId: pageUpdate.driveShortcutId || page.driveShortcutId,
                        driveLinkFileId: pageUpdate.driveLinkFileId || page.driveLinkFileId
                      };
                    })
                  };
                })
              };
            })};
            return next;
          });
        }

        // Build index data (use Drive IDs for order - survives reload when app IDs are regenerated)
        const mergedNotebooks = dataToSync.notebooks.map(nb => {
          const nbUpdate = driveIdUpdates[nb.id];
          return {
            driveFolderId: nbUpdate?.driveFolderId || nb.driveFolderId,
            tabs: nb.tabs.map(tab => {
              const tabUpdate = nbUpdate?.tabs?.[tab.id];
              return {
                driveFolderId: tabUpdate?.driveFolderId || tab.driveFolderId,
                pages: tab.pages.map(page => {
                  const pageUpdate = tabUpdate?.pages?.[page.id];
                  return pageUpdate?.driveFileId || pageUpdate?.driveLinkFileId || page.driveFileId || page.driveLinkFileId;
                }).filter(Boolean)
              };
            })
          };
        });
        const indexData = {
          notebooks: mergedNotebooks.map(nb => nb.driveFolderId).filter(Boolean),
          tabs: {},
          pages: {}
        };
        for (const nb of mergedNotebooks) {
          if (nb.driveFolderId) {
            indexData.tabs[nb.driveFolderId] = nb.tabs.map(t => t.driveFolderId).filter(Boolean);
            for (const tab of nb.tabs) {
              if (tab.driveFolderId && tab.pages.length > 0) {
                indexData.pages[tab.driveFolderId] = tab.pages;
              }
            }
          }
        }
        try {
          await GoogleAPI.saveIndexFile(driveRootFolderId, indexData);
          log('SYNC', 'structure sync: strata_index.json saved');
        } catch (error) {
          log('ERROR', 'Error saving strata_index.json:', error);
        }
        
        // Update manifest.json and index.html (use dataRef for latest structure)
        try {
          await GoogleAPI.updateManifest(dataRef.current, driveRootFolderId, APP_VERSION);
          await GoogleAPI.uploadIndexHtml(generateOfflineViewerHtml(), driveRootFolderId);
          log('SYNC', 'structure sync: manifest and index.html updated');
        } catch (error) {
          log('ERROR', 'Error updating manifest/index.html:', error);
        }
        
        localStorage.setItem("ideaforge_last_synced_hash", JSON.stringify(dataRef.current.notebooks));
        setLastSyncTime(Date.now());
        log('SYNC', 'structure sync: complete');
      } catch (error) {
        log('ERROR', 'Error syncing structure:', error);
      } finally {
        setIsSyncing(false);
        setHasUnsyncedChanges(false);
        syncLockRef.current = false;
        
        if (pendingSyncRef.current) {
          pendingSyncRef.current = false;
          setTimeout(syncStructure, 1000);
        }
        
        // If a content sync was blocked by the lock, trigger a retry
        if (pendingContentSyncRef.current) {
          pendingContentSyncRef.current = false;
          setTimeout(() => setContentSyncVersion(v => v + 1), 2000);
        }
      }
    };

    // Reduced delay for faster sync (localStorage provides immediate backup now)
    const syncTimeout = setTimeout(syncStructure, 1000);
    return () => clearTimeout(syncTimeout);
  }, [structureVersion, isAuthenticated, isLoadingAuth, driveRootFolderId, hasInitialLoadCompleted, setData]);

  // Content sync - update page content files (uses dataRef to avoid re-running on every data change)
  useEffect(() => {
    if (!isAuthenticated || isLoadingAuth || !driveRootFolderId || !hasInitialLoadCompleted) return;
    const currentData = dataRef.current;
    if (!currentData?.notebooks) return;
    
    const syncContent = async () => {
      if (syncLockRef.current) {
        log('SYNC', 'content sync: structure lock held, deferring');
        pendingContentSyncRef.current = true;
        return;
      }
      setIsSyncing(true);
      log('SYNC', 'content sync: start');
      
      try {
        const dataToSync = dataRef.current;
        let pagesSynced = 0;
        for (const notebook of dataToSync.notebooks) {
          for (const tab of notebook.tabs) {
            const tabFolderId = tab.driveFolderId;
            if (!tabFolderId) continue;
            
            for (const page of tab.pages) {
              const pageType = page.type || 'block';
              // Google/embed pages that link to external files (not stored as JSON)
              const isGooglePage = ['doc', 'sheet', 'slide', 'form', 'drawing', 'vid', 'pdf', 'map', 'site', 'script', 'drive'].includes(pageType);
              
              if (!dirtyPagesRef.current.has(page.id)) continue;
              
              // Sync block page content (JSON storage)
              if (!isGooglePage && page.driveFileId && !page.embedUrl) {
                try {
                  await GoogleAPI.syncPageToDrive(page, tabFolderId);
                  pagesSynced++;
                } catch (error) {
                  log('ERROR', `Error updating page content ${page.name}:`, error);
                  log('SYNC', 'content sync: error', { page: page.name, error: error?.message });
                }
              }
              // Sync Google/embed page link (embedUrl, webViewLink) when edit/preview mode changes
              else if (isGooglePage || page.embedUrl) {
                try {
                  await GoogleAPI.syncGooglePageLink(page, tabFolderId);
                  pagesSynced++;
                } catch (error) {
                  log('ERROR', `Error syncing Google page link ${page.name}:`, error);
                }
              }
            }
          }
        }
        dirtyPagesRef.current.clear();
        localStorage.setItem("ideaforge_last_synced_hash", JSON.stringify(dataRef.current.notebooks));
        lastContentSyncRef.current = Date.now();
        log('SYNC', 'content sync: complete', { pagesSynced });
      } finally {
        setIsSyncing(false);
        setHasUnsyncedChanges(false);
      }
    };

    const contentSyncTimeout = setTimeout(syncContent, 2000);
    return () => clearTimeout(contentSyncTimeout);
  }, [isAuthenticated, isLoadingAuth, driveRootFolderId, hasInitialLoadCompleted, contentSyncVersion]);

  // Trigger content sync
  const triggerContentSync = useCallback((pageId) => {
    if (pageId) dirtyPagesRef.current.add(pageId);
    setHasUnsyncedChanges(true);
    setContentSyncVersion(v => v + 1);
  }, []);

  // Trigger structure sync
  const triggerStructureSync = useCallback(() => {
    setHasUnsyncedChanges(true);
    setStructureVersion(v => v + 1);
  }, []);

  // Load data from Drive
  const loadFromDrive = useCallback(async () => {
    if (!isAuthenticated || isLoadingAuth) return null;
    
    try {
      const cacheKey = userEmail ? `ideaforge-cache-${userEmail}` : null;
      const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

      // Check cache first
      let cached = null;
      if (cacheKey) {
        const sessionCached = sessionStorage.getItem(cacheKey);
        const localCached = localStorage.getItem(cacheKey);
        
        if (sessionCached) {
          try { cached = JSON.parse(sessionCached); } catch (e) { /* ignore */ }
        }
        if (!cached && localCached) {
          try {
            const parsed = JSON.parse(localCached);
            const age = Date.now() - (parsed.timestamp || 0);
            if (age < CACHE_MAX_AGE_MS && parsed.data) {
              cached = parsed;
            }
          } catch (e) { /* ignore */ }
        }
        log('SYNC', 'loadFromDrive: cache check', { cacheKey, hasCached: !!cached, cachedNotebookCount: cached?.data?.notebooks?.length });
      }

      // Get root folder
      const rootFolderId = await GoogleAPI.getOrCreateRootFolder();
      log('SYNC', 'loadFromDrive: root folder', { rootFolderId });
      
      // Load from Drive
      const driveData = await GoogleAPI.loadFromDriveStructure(rootFolderId);
      
      if (driveData && driveData.notebooks) {
        log('SYNC', 'loadFromDrive: loaded from Drive', { notebookCount: driveData.notebooks.length });
        const reconciled = reconcileData(driveData);
        setDriveRootFolderId(rootFolderId);
        // Cache the data
        if (cacheKey) {
          const cacheEntry = { data: reconciled, timestamp: Date.now() };
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
            localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
          } catch (e) { /* quota or disabled */ }
        }
        setHasInitialLoadCompleted(true);
        return reconciled;
      }
      
      if (cached?.data) {
        log('SYNC', 'loadFromDrive: using cached data', { notebookCount: cached.data.notebooks?.length });
        const reconciled = reconcileData(cached.data);
        setDriveRootFolderId(rootFolderId);
        setHasInitialLoadCompleted(true);
        return reconciled;
      }
      
      log('SYNC', 'loadFromDrive: Drive empty or failed');
      setDriveRootFolderId(rootFolderId);
      setHasInitialLoadCompleted(true);
      return null;
    } catch (error: unknown) {
      log("ERROR", "Error loading from Drive:", error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Authentication")) {
        showNotification?.("Authentication expired. Please sign in again.", "error");
      }
      setHasInitialLoadCompleted(true);
      return null;
    }
  }, [isAuthenticated, isLoadingAuth, userEmail, showNotification]);

  // Sync rename to Drive
  const syncRenameToDrive = useCallback(async (type, id) => {
    if (!isAuthenticated) return;
    const currentData = dataRef.current;
    if (!currentData?.notebooks) return;
    
    for (const nb of currentData.notebooks) {
      if (type === 'notebook' && nb.id === id && nb.driveFolderId) {
        try {
          await GoogleAPI.renameDriveItem(nb.driveFolderId, GoogleAPI.sanitizeFileName(nb.name));
        } catch (err) {
          log('ERROR', 'Error updating notebook folder:', err);
        }
        triggerStructureSync();
        return;
      }
      for (const tab of nb.tabs) {
        if (type === 'tab' && tab.id === id && tab.driveFolderId) {
          try {
            await GoogleAPI.renameDriveItem(tab.driveFolderId, GoogleAPI.sanitizeFileName(tab.name));
          } catch (err) {
            log('ERROR', 'Error updating tab folder:', err);
          }
          triggerStructureSync();
          return;
        }
        for (const pg of tab.pages) {
          if (pg.id === id) {
            if (pg.driveFileId) {
              try {
                await GoogleAPI.renameDriveItem(pg.driveFileId, GoogleAPI.sanitizeFileName(pg.name) + '.json');
              } catch (err) {
                log('ERROR', 'Error updating page file:', err);
              }
            }
            if (pg.driveShortcutId) {
              try {
                await GoogleAPI.renameDriveItem(pg.driveShortcutId, pg.name);
              } catch (err) {
                log('ERROR', 'Error updating page shortcut:', err);
              }
            }
            triggerContentSync(id);
            triggerStructureSync();
            return;
          }
        }
      }
    }
  }, [isAuthenticated, triggerStructureSync, triggerContentSync]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsyncedChanges) {
        e.preventDefault();
        e.returnValue = "You have unsynced changes. Please wait for sync to finish.";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsyncedChanges]);

  return {
    // Auth state
    isAuthenticated,
    isLoadingAuth,
    userEmail,
    userName,
    
    // Sync state
    driveRootFolderId,
    isSyncing,
    lastSyncTime,
    hasUnsyncedChanges,
    hasInitialLoadCompleted,
    
    // Actions (use useAuth().signIn / signOut for authentication)
    loadFromDrive,
    triggerStructureSync,
    triggerContentSync,
    syncRenameToDrive,
    queueDriveDelete,
    moveItemInDrive
  };
}
