/*
 * Google API Configuration — reads from Vite environment variables.
 */

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
export const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || "";
/** Includes drive.appdata for the hidden App Data folder (IdeaForge_DB). Users must re-consent if this scope was added after their last sign-in. */
export const SCOPES = [
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export default { CLIENT_ID, API_KEY, SCOPES };
