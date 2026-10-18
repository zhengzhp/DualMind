export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  /** 鼠标悬停时的完整说明（标签被截短时用） */
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** 作用于外层容器（宽度 / 布局写这里，如 `min-w-0 flex-1`） */
  className?: string;
}

/**
 * 分段控件：用于只有 2~3 个互斥选项的场景。
 *
 * 视觉：surface-2 底槽 + 白色活动块 + card 阴影；活动态不再用实心品牌蓝，
 * 避免与主按钮争夺注意力（见 docs/ui-refresh-plan.md §5-5）。
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`flex gap-1 rounded-control bg-surface-2 p-1 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title ?? option.label}
            disabled={disabled}
            // 已选中时不再回调，避免无意义的重复保存
            onClick={() => {
              if (!active) onChange(option.value);
            }}
            className={`min-w-0 flex-1 truncate rounded-[7px] px-2.5 py-1.5 text-center text-label font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
              active
                ? 'bg-surface text-ink shadow-card'
                : 'text-ink-2 hover:text-ink'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
