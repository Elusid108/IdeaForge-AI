const API_KEY_STORAGE_KEY = "ideaforge_gemini_api_key";
const SELECTED_TEXT_MODEL_KEY = "ideaforge_selected_text_model";
const SELECTED_IMAGE_MODEL_KEY = "ideaforge_selected_image_model";

export const getApiKey = (): string | null => {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
};

export const setApiKey = (key: string): void => {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
};

export const removeApiKey = (): void => {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
};

export const getSelectedTextModel = (): string | null => {
  return localStorage.getItem(SELECTED_TEXT_MODEL_KEY);
};

export const setSelectedTextModelStorage = (model: string): void => {
  localStorage.setItem(SELECTED_TEXT_MODEL_KEY, model);
};

export const getSelectedImageModel = (): string | null => {
  return localStorage.getItem(SELECTED_IMAGE_MODEL_KEY);
};

export const setSelectedImageModelStorage = (model: string): void => {
  localStorage.setItem(SELECTED_IMAGE_MODEL_KEY, model);
};
