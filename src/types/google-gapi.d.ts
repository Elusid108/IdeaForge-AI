/* Minimal global typings for Google API + Identity Services (gapi / google). */

declare global {
  interface Window {
    gapi?: typeof gapi;
    google?: typeof google;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gapi: any;

  namespace google {
    namespace accounts {
      namespace oauth2 {
        interface TokenClient {
          requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
        }
        function initTokenClient(config: {
          client_id: string;
          scope: string;
          callback: (response: {
            access_token?: string;
            expires_in?: number;
            error?: string;
          }) => void;
          error_callback?: (error: { message?: string }) => void;
        }): TokenClient;
      }
    }
  }
}

export {};
