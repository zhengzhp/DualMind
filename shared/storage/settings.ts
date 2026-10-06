import { storage } from 'wxt/utils/storage';
import { MIGRATION_IDS, shouldMigrateToolbarTrigger } from './migrations';
import {
  DEFAULT_IMMERSIVE_PREFS,
  DEFAULT_SETTINGS,
  type AppSettings,
  type ImmersivePrefs,
} from './types';

/** 设置项存储 key */
export const settingsItem = storage.defineItem<AppSettings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

/** 已执行过的迁移 ID（幂等标记，防止重复迁移） */
const migrationsItem = storage.defineItem<string[]>('local:migrations', {
  fallback: [],
});

/**
 * 一次性迁移：旧的默认值是 auto，新默认值改为 shortcut，
 * 需把已存的历史值收敛过来。
 * 注意：用户若曾手动选择 auto，也会被本次迁移覆盖为 shortcut（一次性的代价）。
 */
async function runMigrations(): Promise<void> {
  const applied = await migrationsItem.getValue();
  const stored = await settingsItem.getValue();
  if (!shouldMigrateToolbarTrigger(applied, stored.toolbarTrigger)) return;

  await settingsItem.setValue({ ...stored, toolbarTrigger: 'shortcut' });
  await migrationsItem.setValue([
    ...applied,
    MIGRATION_IDS.toolbarDefaultShortcut,
  ]);
}

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

/**
 * 沉浸式全文翻译偏好。
 * 刻意用独立 storage 键：切换展示模式不应触发 `translateSession` 的监听回调。
 */
export const immersivePrefsItem = storage.defineItem<ImmersivePrefs>(
  'local:immersivePrefs',
  {
    fallback: DEFAULT_IMMERSIVE_PREFS,
  },
);

/** 读取沉浸式偏好（与默认值合并，容忍旧版本缺字段） */
export async function getImmersivePrefs(): Promise<ImmersivePrefs> {
  const stored = await immersivePrefsItem.getValue();
  return { ...DEFAULT_IMMERSIVE_PREFS, ...stored };
}

/** 合并写入沉浸式偏好 */
export async function saveImmersivePrefs(
  patch: Partial<ImmersivePrefs>,
): Promise<ImmersivePrefs> {
  const next = { ...(await getImmersivePrefs()), ...patch };
  await immersivePrefsItem.setValue(next);
  return next;
}

/** 读取并与默认值合并，避免旧版本缺字段 */
export async function getSettings(): Promise<AppSettings> {
  // 单一入口顺带跑迁移，保证任何调用方拿到的都是迁移后的值（幂等）
  await runMigrations();
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
