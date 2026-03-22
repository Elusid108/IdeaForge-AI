import { useGeminiSettingsStore, type ModelOption } from "@/store/useGeminiSettingsStore";

interface GeminiModelResponse {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
  supported_generation_methods?: string[];
}

interface ModelsListResponse {
  models?: GeminiModelResponse[];
  error?: { message?: string };
}

const EXCLUDE_PATTERNS = ["embedding", "aqa", "answer", "vision", "image"];

function sortModels(models: ModelOption[]): ModelOption[] {
  return [...models].sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aHasGemini = aName.includes("gemini");
    const bHasGemini = bName.includes("gemini");
    const aHasGemma = aName.includes("gemma");
    const bHasGemma = bName.includes("gemma");

    if (aHasGemini && !bHasGemini) return -1;
    if (!aHasGemini && bHasGemini) return 1;
    if (aHasGemma && !bHasGemma) return -1;
    if (!aHasGemma && bHasGemma) return 1;
    return bName.localeCompare(aName);
  });
}

export async function fetchModels(key: string): Promise<void> {
  const { setAvailableTextModels, setAvailableImageModels } = useGeminiSettingsStore.getState();

  if (!key?.trim()) return;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key.trim())}`
    );
    const data: ModelsListResponse = await response.json();

    if (data.error) {
      setAvailableTextModels([]);
      setAvailableImageModels([]);
      return;
    }

    const rawModels = data.models ?? [];

    const textModels: ModelOption[] = [];
    const imageModels: ModelOption[] = [];

    for (const model of rawModels) {
      const name = model.name ?? "";
      const nameLower = name.toLowerCase();
      const displayName = model.displayName ?? name.replace(/^models\//, "");
      const displayNameLower = displayName.toLowerCase();
      const methods = model.supportedGenerationMethods ?? model.supported_generation_methods ?? [];

      const hasGenerateContent = methods.some((m) => String(m).toLowerCase() === "generatecontent");

      const excluded = EXCLUDE_PATTERNS.some((p) => nameLower.includes(p));

      if (hasGenerateContent && !excluded) {
        textModels.push({ name, displayName });
      }

      const isImagenByName = nameLower.includes("imagen") || nameLower.includes("image");
      const isImageByDisplayName = displayNameLower.includes("nano banana");
      const isImageModel = isImagenByName || isImageByDisplayName;

      if (isImageModel) {
        const isGeminiImage =
          hasGenerateContent &&
          (displayNameLower.includes("nano banana") ||
            (nameLower.includes("gemini") &&
              (displayNameLower.includes("image") || displayNameLower.includes("vision"))));
        const imageEndpoint = isGeminiImage ? "generateContent" : "predict";
        imageModels.push({ name, displayName, imageEndpoint });
      }
    }

    const sortedText = sortModels(textModels);
    const sortedImage = sortModels(imageModels);
    setAvailableTextModels(sortedText);
    setAvailableImageModels(sortedImage);

    const { selectedImageModel, setSelectedImageModel } = useGeminiSettingsStore.getState();
    const modelIds = sortedImage.map((m) => m.name.replace(/^models\//, ""));
    if (sortedImage.length > 0 && !modelIds.includes(selectedImageModel)) {
      const nanoBanana = sortedImage.find((m) =>
        m.displayName.toLowerCase().includes("nano banana")
      );
      const safeDefault =
        nanoBanana ||
        sortedImage.find((m) => m.imageEndpoint === "predict") ||
        sortedImage[0];
      setSelectedImageModel(safeDefault.name.replace(/^models\//, ""));
    }
  } catch {
    setAvailableTextModels([]);
    setAvailableImageModels([]);
  }
}
