/**
 * 一次性数据迁移的「纯逻辑」部分。
 *
 * 本模块刻意不 import `wxt/utils/storage`，以便直接做单元测试；
 * 真正的读写（IO）在 `shared/storage/settings.ts` 里完成。
 */

/** 迁移 ID 常量（记录到 local:migrations，保证幂等） */
export const MIGRATION_IDS = {
  /** 划词工具栏默认值由 auto 收敛为 shortcut */
  toolbarDefaultShortcut: 'toolbar-default-shortcut-v1',
} as const;

/**
 * 是否需要把旧的「选中后自动显示」（auto）迁移为新的默认「仅快捷键」（shortcut）。
 * 仅当：该迁移尚未执行过，且当前存的是旧默认值 auto。
 */
export function shouldMigrateToolbarTrigger(
  applied: readonly string[],
  storedToolbarTrigger: string | undefined,
): boolean {
  return (
    !applied.includes(MIGRATION_IDS.toolbarDefaultShortcut) &&
    storedToolbarTrigger === 'auto'
  );
}
