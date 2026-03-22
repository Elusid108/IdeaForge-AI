import { create } from "zustand";
import {
  getSelectedImageModel,
  getSelectedTextModel,
  setSelectedImageModelStorage,
  setSelectedTextModelStorage,
} from "@/services/storage/geminiSettingsStorage";

export type ImageEndpointType = "predict" | "generateContent";

export interface ModelOption {
  name: string;
  displayName: string;
  imageEndpoint?: ImageEndpointType;
}

interface GeminiSettingsState {
  apiKey: string;
  setApiKey: (key: string) => void;

  availableTextModels: ModelOption[];
  availableImageModels: ModelOption[];
  selectedTextModel: string;
  selectedImageModel: string;
  setAvailableTextModels: (models: ModelOption[]) => void;
  setAvailableImageModels: (models: ModelOption[]) => void;
  setSelectedTextModel: (model: string) => void;
  setSelectedImageModel: (model: string) => void;

  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
}

export const useGeminiSettingsStore = create<GeminiSettingsState>((set) => ({
  apiKey: "",
  setApiKey: (key: string) => set({ apiKey: key }),

  availableTextModels: [],
  availableImageModels: [],
  selectedTextModel: getSelectedTextModel() ?? "gemini-2.5-flash",
  selectedImageModel: getSelectedImageModel() ?? "gemini-2.5-flash-image",
  setAvailableTextModels: (models: ModelOption[]) => set({ availableTextModels: models }),
  setAvailableImageModels: (models: ModelOption[]) => set({ availableImageModels: models }),
  setSelectedTextModel: (model: string) => {
    setSelectedTextModelStorage(model);
    set({ selectedTextModel: model });
  },
  setSelectedImageModel: (model: string) => {
    setSelectedImageModelStorage(model);
    set({ selectedImageModel: model });
  },

  showSettings: false,
  setShowSettings: (show: boolean) => set({ showSettings: show }),
}));
