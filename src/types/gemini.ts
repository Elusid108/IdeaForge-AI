/** Gemini Generative Language API JSON response shape (text generation). */
export interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
      }>;
    };
  }>;
  error?: {
    message?: string;
    code?: number;
    status?: string;
  };
}
