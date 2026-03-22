import { callTextAI } from "./apiClient";

export const generateRandomPrompt = async (
  key: string,
  category: string,
  model?: string
): Promise<string> => {
  let focusInstruction =
    "The Subject: Randomly select a new subject for every response. It can be anything—a cosmic event, a quiet domestic moment, a mythological creature, a futuristic architectural detail, or a microscopic interaction.";

  if (category === "CHARACTER")
    focusInstruction =
      "The Subject: Create a unique CHARACTER or CREATURE. Focus on their appearance, clothing, expression, and posture.";
  if (category === "LOCATION")
    focusInstruction =
      "The Subject: Create a unique LOCATION or SETTING. Focus on the architecture, landscape, weather, and atmosphere.";
  if (category === "OBJECT")
    focusInstruction =
      "The Subject: Create a unique OBJECT or ARTIFACT. Focus on materials, craftsmanship, wear and tear, and mysterious properties.";
  if (category === "WEAPON")
    focusInstruction =
      "The Subject: Create a unique WEAPON or PIECE OF ARMOR. Focus on design, functionality, materials, and magical or technological aura.";
  if (category === "VEHICLE")
    focusInstruction =
      "The Subject: Create a unique VEHICLE or MECH. Focus on engineering, propulsion, scale, and intended use.";
  if (category === "FOOD")
    focusInstruction =
      "The Subject: Create a delicious or alien FOOD or DRINK item. Focus on texture, steam, plating, and ingredients.";

  const systemInstruction = `You are a visionary poet with an infinite imagination. Your task is to hallucinate a new visual scene and describe it with breathtaking eloquence.

**Your Instructions:**
1. ${focusInstruction} Never repeat a theme twice in a row.
2. **The Tone:** Write like a master poet. Use sensory language, metaphor, and emotive adjectives. Focus deeply on lighting, texture, atmosphere, and the "feeling" of the scene.
3. **The Constraint:** Describe **ONLY** the visual reality within the scene. Do NOT describe the artistic medium or rendering style.
    * *BAD:* "A photorealistic oil painting of a cat."
    * *GOOD:* "A feline silhouette bathed in amber dusk, its fur a rugged landscape of shadow and gold."
4. **Length:** Write a **minimum of 3 sentences**. Aim for a lush, detailed paragraph. Do not be brief.

**Output:** Just the description. Nothing else.`;

  try {
    return await callTextAI(key, systemInstruction, "Hallucinate a new visual scene now.", model);
  } catch (e) {
    console.error("All text models failed", e);
    return "A mysterious object floating in space (API Error Fallback).";
  }
};

export const generateFilename = async (
  key: string,
  originalPrompt: string,
  model?: string
): Promise<string> => {
  const systemInstruction = "You are a filename generator.";
  const userPrompt = `Create a very short, filename-safe title (1-3 words, using underscores instead of spaces, no special chars, no file extension) that summarizes this image description: "${originalPrompt}". Output ONLY the summary.`;

  try {
    const name = await callTextAI(key, systemInstruction, userPrompt, model);
    return name.replace(/[^a-zA-Z0-9_]/g, "");
  } catch {
    return `Image_${Date.now()}`;
  }
};
