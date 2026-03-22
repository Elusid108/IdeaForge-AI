/**
 * Logging for Drive sync — gated by dev mode and VITE_IDEAFORGE_DEBUG_SYNC.
 */

const IS_PROD = import.meta.env.PROD;
const DEBUG_SYNC = import.meta.env.VITE_IDEAFORGE_DEBUG_SYNC === "true";

function shouldLog(category: string): boolean {
  if (IS_PROD) return false;
  if (category === "SYNC") return DEBUG_SYNC;
  return true;
}

/**
 * Log a message with category prefix.
 */
export function log(category: string, message: string, ...args: unknown[]): void {
  if (!shouldLog(category)) return;
  const prefix = `[${category}]`;
  if (category === "ERROR") {
    console.error(prefix, message, ...args);
  } else {
    console.log(prefix, message, ...args);
  }
}
