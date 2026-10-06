import { describe, expect, it } from 'vitest';
import { MIGRATION_IDS, shouldMigrateToolbarTrigger } from './migrations';

describe('shouldMigrateToolbarTrigger', () => {
  it('未执行过 + 存的是旧默认 auto → 需要迁移', () => {
    expect(shouldMigrateToolbarTrigger([], 'auto')).toBe(true);
  });

  it('已执行过（迁移 ID 在册）→ 不再迁移', () => {
    expect(
      shouldMigrateToolbarTrigger(
        [MIGRATION_IDS.toolbarDefaultShortcut],
        'auto',
      ),
    ).toBe(false);
  });

  it('已是新默认 shortcut → 无需迁移', () => {
    expect(shouldMigrateToolbarTrigger([], 'shortcut')).toBe(false);
  });

  it('空串 / undefined → 不迁移', () => {
    expect(shouldMigrateToolbarTrigger([], '')).toBe(false);
    expect(shouldMigrateToolbarTrigger([], undefined)).toBe(false);
  });
});
