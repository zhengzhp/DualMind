import { storage } from 'wxt/utils/storage';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
} from './types';

/** 设置项存储 key */
export const settingsItem = storage.defineItem<AppSettings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

/** 最近一次划词翻译会话（供 Side Panel 承接） */
export interface TranslateSession {
  sourceText: string;
  translatedText: string;
  targetLanguage: string;
  updatedAt: number;
  error?: string;
}

export const translateSessionItem = storage.defineItem<TranslateSession | null>(
  'local:translateSession',
  {
    fallback: null,
  },
);

/** 读取并与默认值合并，避免旧版本缺字段 */
export async function getSettings(): Promise<AppSettings> {
  const stored = await settingsItem.getValue();
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    openai: { ...DEFAULT_SETTINGS.openai, ...stored?.openai },
    ollama: { ...DEFAULT_SETTINGS.ollama, ...stored?.ollama },
  };
}

export async function saveSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    openai: { ...current.openai, ...patch.openai },
    ollama: { ...current.ollama, ...patch.ollama },
  };
  await settingsItem.setValue(next);
  return next;
}
