"use client";

import useSWR, { type SWRConfiguration } from "swr";
import {
  getBotConfig,
  type BotConfigDTO,
} from "@/app/lib/services/botConfigService";
import { BOT_CONFIG_SWR_KEY } from "@/app/lib/swrKeys";

interface UseBotConfigOptions
  extends Omit<SWRConfiguration<BotConfigDTO, Error>, "fetcher"> {
  enabled?: boolean;
}

export function useBotConfig(options: UseBotConfigOptions = {}) {
  const { enabled = true, ...swrOptions } = options;

  return useSWR<BotConfigDTO, Error>(
    enabled ? BOT_CONFIG_SWR_KEY : null,
    getBotConfig,
    swrOptions,
  );
}

export default useBotConfig;
