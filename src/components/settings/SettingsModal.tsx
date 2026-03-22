import React, { FormEvent } from "react";
import { Settings, ExternalLink, RefreshCw } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";

export const SettingsModal: React.FC = () => {
  const {
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
  } = useSettings();

  if (!showSettings) return null;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const key = formData.get("key") as string;
    saveSettings(key);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-2 mb-4 text-primary">
          <Settings className="w-6 h-6" />
          <h2 className="text-xl font-bold">Settings</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          To use IdeaForge AI features, add a Google Gemini API key. Your key is stored locally in your browser
          and is not sent to our servers.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs uppercase font-bold text-muted-foreground">API Key</label>
            <input
              name="key"
              defaultValue={apiKey}
              type="password"
              placeholder="AIza..."
              className="w-full bg-background border border-border rounded-lg p-3 text-foreground focus:ring-2 focus:ring-primary outline-none mt-1"
            />
          </div>
          <div className="flex gap-2 text-xs text-primary">
            <ExternalLink size={12} className="shrink-0 mt-0.5" />
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              Get a free API Key from Google AI Studio
            </a>
          </div>
          {apiKey && (
            <div className="flex justify-between items-center bg-muted/50 border border-border p-3 rounded-lg">
              <span className="text-xs text-muted-foreground">
                {availableTextModels.length > 0 || availableImageModels.length > 0
                  ? `${availableTextModels.length} text, ${availableImageModels.length} image models`
                  : "No models loaded"}
              </span>
              <button
                type="button"
                onClick={() => void refreshModels()}
                disabled={isRefreshingModels}
                className="text-xs px-3 py-2 bg-primary/15 text-primary hover:bg-primary/25 rounded-md transition-colors flex items-center gap-2 font-medium disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingModels ? "animate-spin" : ""}`} />
                {isRefreshingModels ? "Scanning..." : "Refresh List"}
              </button>
            </div>
          )}
          {availableTextModels.length > 0 && (
            <>
              <div>
                <label className="text-xs uppercase font-bold text-muted-foreground">
                  Text Generation Model
                </label>
                <select
                  value={selectedTextModel}
                  onChange={(e) => setSelectedTextModel(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg p-3 text-foreground focus:ring-2 focus:ring-primary outline-none mt-1"
                >
                  {availableTextModels.map((model) => (
                    <option key={model.name} value={model.name.replace(/^models\//, "")}>
                      {model.displayName || model.name}
                    </option>
                  ))}
                </select>
              </div>
              {availableImageModels.length > 0 && (
                <div>
                  <label className="text-xs uppercase font-bold text-muted-foreground">
                    Image Generation Model
                  </label>
                  <select
                    value={selectedImageModel}
                    onChange={(e) => setSelectedImageModel(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg p-3 text-foreground focus:ring-2 focus:ring-primary outline-none mt-1"
                  >
                    {availableImageModels.map((model) => (
                      <option key={model.name} value={model.name.replace(/^models\//, "")}>
                        {model.displayName || model.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          <div className="flex justify-end gap-2 mt-6">
            {apiKey && (
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-lg transition-colors"
            >
              Save Key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
