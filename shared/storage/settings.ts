import { storage } from 'wxt/utils/storage';
import { MIGRATION_IDS, shouldMigrateToolbarTrigger } from './migrations';
import {
  mergeChatSession,
  removeSessionById,
  toChatSessionSummaries,
} from './chatSessions';
import {
  evaluateChatPending,
  type ConsumeChatPendingResult,
} from './chatPendingEval';
import {
  DEFAULT_CHAT_PREFS,
  DEFAULT_IMMERSIVE_PREFS,
  DEFAULT_SETTINGS,
  type AppSettings,
  type ChatPageNavSignal,
  type ChatPendingAction,
  type ChatPrefs,
  type ChatSession,
  type ChatSessionSummary,
  type ImmersivePrefs,
  type PageFabPos,
} from './types';

export type { ConsumeChatPendingResult };
export { evaluateChatPending };

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

/* ------------------------------------------------------------------ *
 * 页面悬浮入口位置（`local:pageFabPos`）
 *
 * 独立键：用户拖动入口只是挪个位置，不应触发沉浸译 / 聊天等偏好监听回调。
 * ------------------------------------------------------------------ */

/** 悬浮入口位置；未拖动过时为 null（由 UI 走默认右下角） */
export const pageFabPosItem = storage.defineItem<PageFabPos | null>(
  'local:pageFabPos',
  {
    fallback: null,
  },
);

export async function getPageFabPos(): Promise<PageFabPos | null> {
  return pageFabPosItem.getValue();
}

export async function savePageFabPos(pos: PageFabPos): Promise<void> {
  await pageFabPosItem.setValue(pos);
}

/* ------------------------------------------------------------------ *
 * V2 聊天（摘要 / 问答）
 *
 * 与沉浸译偏好同样使用独立 storage 键：改上下文范围不应触发会话监听。
 * 纯逻辑（容量裁剪 / 摘要）在 `./chatSessions`，此处只做 IO 与合并。
 * ------------------------------------------------------------------ */

/** 聊天偏好 */
export const chatPrefsItem = storage.defineItem<ChatPrefs>('local:chatPrefs', {
  fallback: DEFAULT_CHAT_PREFS,
});

/** 全局聊天会话列表（写入时按上限淘汰最旧） */
export const chatSessionsItem = storage.defineItem<ChatSession[]>(
  'local:chatSessions',
  {
    fallback: [],
  },
);

/** 读取聊天偏好（与默认值合并，容忍旧版本缺字段） */
export async function getChatPrefs(): Promise<ChatPrefs> {
  const stored = await chatPrefsItem.getValue();
  return { ...DEFAULT_CHAT_PREFS, ...stored };
}

/** 合并写入聊天偏好 */
export async function saveChatPrefs(
  patch: Partial<ChatPrefs>,
): Promise<ChatPrefs> {
  const next = { ...(await getChatPrefs()), ...patch };
  await chatPrefsItem.setValue(next);
  return next;
}

/** 会话列表（摘要，按更新时间倒序） */
export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  return toChatSessionSummaries(await chatSessionsItem.getValue());
}

/** 读取单个会话完整内容 */
export async function getChatSession(id: string): Promise<ChatSession | null> {
  const sessions = await chatSessionsItem.getValue();
  return sessions.find((session) => session.id === id) ?? null;
}

/** 新增 / 更新会话（写入时裁剪消息数并按上限淘汰最旧） */
export async function upsertChatSession(
  session: ChatSession,
): Promise<ChatSession> {
  const next = mergeChatSession(await chatSessionsItem.getValue(), session);
  await chatSessionsItem.setValue(next);
  return next.find((item) => item.id === session.id) ?? session;
}

/** 删除单个会话 */
export async function deleteChatSession(id: string): Promise<void> {
  const next = removeSessionById(await chatSessionsItem.getValue(), id);
  await chatSessionsItem.setValue(next);
}

/** 清空全部会话 */
export async function clearChatSessions(): Promise<void> {
  await chatSessionsItem.setValue([]);
}

/**
 * 待执行动作信箱（`local:chatPending`）。
 * 独立键：与偏好 / 会话解耦，消费后立即置空，天然幂等。
 */
export const chatPendingItem = storage.defineItem<ChatPendingAction | null>(
  'local:chatPending',
  {
    fallback: null,
  },
);

/** 写入一条待执行动作（右键菜单触发） */
export async function setChatPending(
  kind: ChatPendingAction['kind'],
): Promise<void> {
  await chatPendingItem.setValue({ kind, createdAt: Date.now() });
}

/**
 * 取出并清空待执行动作（取过即清，天然幂等）。
 * 超过 TTL 的旧动作返回 `expired`，由 UI 提示用户再试一次。
 */
export async function consumeChatPending(): Promise<ConsumeChatPendingResult> {
  const action = await chatPendingItem.getValue();
  if (!action) return { status: 'empty' };
  await chatPendingItem.setValue(null);
  return evaluateChatPending(action);
}

/** SPA 路由变化信号（网页助手用来提示上下文可能过期） */
export const chatPageNavItem = storage.defineItem<ChatPageNavSignal | null>(
  'local:chatPageNav',
  { fallback: null },
);

export async function setChatPageNavSignal(
  signal: Omit<ChatPageNavSignal, 'at'> & { at?: number },
): Promise<void> {
  await chatPageNavItem.setValue({
    url: signal.url,
    title: signal.title,
    at: signal.at ?? Date.now(),
  });
}
