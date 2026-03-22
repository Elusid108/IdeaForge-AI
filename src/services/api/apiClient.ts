import type { GeminiResponse } from "@/types/gemini";

export const callTextAI = async (
  key: string,
  systemInstruction: string,
  userPrompt: string,
  model: string = "gemini-2.0-flash"
): Promise<string> => {
  const modelId = model.replace(/^models\//, "");

  const mergedPrompt = `${systemInstruction}\n\nTask: ${userPrompt}`;

  const apiVersions = ["v1", "v1beta"] as const;
  let lastError: Error | null = null;

  const tryRequest = async (
    version: (typeof apiVersions)[number],
    useSystemInstruction: boolean
  ): Promise<string | null> => {
    const payload = useSystemInstruction
      ? {
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { temperature: 1.4 },
        }
      : {
          contents: [{ parts: [{ text: mergedPrompt }] }],
        };

    const url = `https://generativelanguage.googleapis.com/${version}/models/${modelId}:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data: GeminiResponse = await response.json();

    if (data.error) {
      if (data.error.message?.includes("not found") || response.status === 404) {
        lastError = new Error(`Model ${modelId} not found in ${version}`);
        return null;
      }
      if (
        data.error.message?.includes("Unknown name") ||
        data.error.message?.includes("Cannot find field") ||
        response.status === 400
      ) {
        lastError = new Error(`Model ${modelId} payload error in ${version}`);
        return null;
      }
      throw new Error(`Model ${modelId} failed: ${data.error.message}`);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error(`Model ${modelId} returned no text`);
    return text;
  };

  for (const version of apiVersions) {
    try {
      const useSystemInstruction = version === "v1beta";
      let text = await tryRequest(version, useSystemInstruction);

      if (text !== null) return text;

      if (version === "v1beta" && lastError?.message?.includes("payload error")) {
        text = await tryRequest(version, false);
        if (text !== null) return text;
      }
    } catch (e) {
      const error = e as Error;
      if (
        !error.message.includes("not found") &&
        !error.message.includes("404") &&
        !error.message.includes("payload error")
      ) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError || new Error(`Model ${modelId} failed in all API versions`);
};
