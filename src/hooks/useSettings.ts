import { useEffect, useState } from "react";
import { useGeminiSettingsStore } from "@/store/useGeminiSettingsStore";
import { getApiKey, setApiKey as saveApiKeyToStorage } from "@/services/storage/geminiSettingsStorage";
import { fetchModels } from "@/services/api/models";

export const useSettings = () => {
  const {
    apiKey,
    setApiKey,
    showSettings,
    setShowSettings,
    availableTextModels,
    availableImageModels,
    selectedTextModel,
    selectedImageModel,
    setSelectedTextModel,
    setSelectedImageModel,
  } = useGeminiSettingsStore();

  const [isRefreshingModels, setIsRefreshingModels] = useState(false);

  useEffect(() => {
    const storedKey = getApiKey();
    if (storedKey) {
      setApiKey(storedKey);
    } else {
      setShowSettings(true);
    }
  }, [setApiKey, setShowSettings]);

  useEffect(() => {
    if (apiKey?.trim()) {
      void fetchModels(apiKey);
    }
  }, [apiKey]);

  const refreshModels = async () => {
    if (!apiKey?.trim()) return;
    setIsRefreshingModels(true);
    try {
      await fetchModels(apiKey);
    } finally {
      setIsRefreshingModels(false);
    }
  };

  const saveSettings = (key: string) => {
    if (key.trim()) {
      saveApiKeyToStorage(key.trim());
      setApiKey(key.trim());
      setShowSettings(false);
    }
  };

  return {
    apiKey,
    showSettings,
    setShowSettings,
    saveSettings,
    availableTextModels,
    availableImageModels,
    selectedTextModel,
    selectedImageModel,
    setSelectedTextModel,
    setSelectedImageModel,
    refreshModels,
    isRefreshingModels,
  };
};
