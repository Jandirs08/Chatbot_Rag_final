import { API_URL } from "../config";
import { authenticatedFetch } from "./authService";

export interface BotConfigDTO {
  system_prompt: string;
  temperature: number;
  updated_at: string;
  bot_name?: string;
  ui_prompt_extra?: string;
  whatsapp_api_base_url?: string | null;
  whatsapp_token?: string | null;
  whatsapp_phone_number_id?: string | null;
}

export interface UpdateBotConfigRequest {
  system_prompt?: string;
  temperature?: number;
  bot_name?: string;
  ui_prompt_extra?: string;
  whatsapp_api_base_url?: string;
  whatsapp_token?: string;
  whatsapp_phone_number_id?: string;
}

export const getBotConfig = async (): Promise<BotConfigDTO> => {
  const res = await authenticatedFetch(`${API_URL}/bot/config`, {
    method: "GET",
  });
  if (!res.ok) {
    throw new Error(`Error obteniendo configuración: ${res.status}`);
  }
  return res.json();
};

export const updateBotConfig = async (
  payload: UpdateBotConfigRequest
): Promise<BotConfigDTO> => {
  const res = await authenticatedFetch(`${API_URL}/bot/config`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error actualizando configuración: ${res.status} ${text}`);
  }
  return res.json();
};

export const resetBotConfig = async (): Promise<BotConfigDTO> => {
  const res = await authenticatedFetch(`${API_URL}/bot/config/reset`, {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error restableciendo configuración: ${res.status} ${text}`);
  }
  return res.json();
};

export interface BotRuntimeDTO {
  model_name?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  bot_name?: string | null;
  ui_prompt_extra_len?: number;
  effective_personality_len?: number;
}

export const getBotRuntime = async (): Promise<BotRuntimeDTO> => {
  const res = await authenticatedFetch(`${API_URL}/bot/runtime`, {
    method: "GET",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error obteniendo runtime: ${res.status} ${text}`);
  }
  return res.json();
};