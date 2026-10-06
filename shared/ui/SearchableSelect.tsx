import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { fieldClass, fieldClassEmphasis } from './field';
import { CheckIcon, ChevronDownIcon } from './icons';

/** 候选选项：`value` 是落库的值，`label` 是展示文案（如 zh-CN → 简体中文） */
export interface SearchableSelectOption {
  value: string;
  label: string;
  /** 可选的展示图标（图片地址，如模型厂商 logo）；渲染在 label 之前 */
  icon?: string;
}

/** 也接受纯字符串候选：此时 value 与 label 相同（模型名这类场景） */
export type SearchableSelectItem = string | SearchableSelectOption;

export interface SearchableSelectProps {
  value: string;
  options: readonly SearchableSelectItem[];
  /**
   * 值变化。
   * - 选择模式：仅在选中某一项时触发
   * - 编辑模式：每次输入都会触发（父级需把它回填到受控 state）
   */
  onChange: (value: string) => void;
  /**
   * 「确认」时触发，父级可借此持久化（如写 storage）。
   * 编辑模式下失焦 / 回车 / 点选候选项都会触发；选择模式下可不传（onChange 即确认）。
   */
  onCommit?: (value: string) => void;
  /** 编辑模式：输入框可直接填任意值，同时给出候选列表（用于模型名这类「可自定义」字段） */
  editable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** 强调态外观（加粗边框 + 品牌色浅底），用于「当前正在生效」的关键设置 */
  emphasis?: boolean;
  /**
   * 当前值的图标（图片地址）。不依赖 `options` 是否包含该值，
   * 因此「手动输入 / 合并了列表外的当前值」时也能稳定显示图标。
   */
  valueIcon?: string;
  /** 无值时的占位文案 */
  placeholder?: string;
  /** 候选为空时的提示 */
  emptyText?: string;
  /** 是否显示搜索框；默认在「选择模式且候选数 > searchThreshold」时显示 */
  searchable?: boolean;
  /** 候选数量超过该值才默认显示搜索框 */
  searchThreshold?: number;
  /** 触发按钮 / 输入框的 data-testid，便于 E2E 精确定位（同页多个下拉时必须区分） */
  testId?: string;
  /**
   * 面板顶部插槽：随下拉一起展示的关联控制（如「Provider 切换」）。
   * 放在这里而非组件外部，是为了让「换 Provider + 选模型」在同一面板内完成，
   * 从而不必在窄侧栏里单独占用一整块横向空间。
   */
  panelHeader?: ReactNode;
  /**
   * 覆盖面板的定位 / 宽度类。默认 `left-0 right-0`（面板与触发器等宽）。
   * 当触发器很宽（如占满整行）却希望面板保持正常下拉尺寸时，
   * 传入如 `left-auto right-0 w-72` 即可右侧对齐并限宽。
   */
  panelClassName?: string;
  /** 作用于外层容器（宽度 / 布局写这里，如 `min-w-0 flex-1`） */
  className?: string;
}

/**
 * 选项图标槽：统一尺寸的方形图标。
 * 图标缺失 / 加载失败时静默隐藏，避免露出浏览器默认的「碎图」占位。
 */
function OptionIcon({
  src,
  className = '',
}: {
  src: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`h-4 w-4 shrink-0 object-contain ${className}`}
      onError={(event) => {
        event.currentTarget.style.visibility = 'hidden';
      }}
    />
  );
}

/**
 * 自绘下拉，两种形态：
 * - 选择模式（默认）：按钮 + 候选面板，可搜索。用于只能从列表里挑的字段（模型、目标语言）。
 * - 编辑模式（`editable`）：输入框即搜索框，允许提交列表以外的值。用于模型名这类「可选可填」的字段。
 *
 * 相比原生 select / datalist：面板配色、圆角、间距完全可控，收起与展开不会出现系统皮肤，键盘行为一致。
 * 交互要点：
 * - 展开时把焦点移进面板（编辑模式留在输入框）
 * - 方向键移动高亮、Enter 选中、Esc 收起
 * - 编辑模式在「失焦 / 回车 / 点击外部」时才确认，避免每次输入都触发保存
 */
export function SearchableSelect({
  value,
  options,
  onChange,
  onCommit,
  editable = false,
  disabled = false,
  loading = false,
  emphasis = false,
  valueIcon,
  placeholder = '请选择',
  emptyText = '暂无可选项',
  searchable,
  searchThreshold = 8,
  testId = 'searchable-select-trigger',
  panelHeader,
  panelClassName = 'left-0 right-0',
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  /** 候选过滤关键词。编辑模式下与输入内容同步，展开时重置为空以展示完整列表 */
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  /** 统一成 { value, label }：纯字符串候选等价于两者相同 */
  const normalized = useMemo<SearchableSelectOption[]>(
    () =>
      options.map((option) =>
        typeof option === 'string' ? { value: option, label: option } : option,
      ),
    [options],
  );

  // 用 ref 保存最新值：避免把归一化结果 / value / 回调放进 effect 依赖
  // （调用方每次渲染都会重建数组与箭头函数，否则会不断重置用户的高亮或重复订阅事件）
  const optionsRef = useRef(normalized);
  optionsRef.current = normalized;
  const valueRef = useRef(value);
  valueRef.current = value;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const editableRef = useRef(editable);
  editableRef.current = editable;

  const listId = useId();
  const isDisabled = disabled || loading;
  /** 触发器外观：默认态 / 强调态（强调态用于「当前生效」类关键设置） */
  const fieldAppearance = emphasis ? fieldClassEmphasis : fieldClass;
  /** 选择模式才需要独立的搜索框（编辑模式的输入框本身就是搜索） */
  const showSearch =
    searchable ?? (!editable && normalized.length > searchThreshold);
  /** 当前值对应的候选（值合法但不在候选里时，回退显示原始值） */
  const selected = normalized.find((option) => option.value === value);
  /** 当前值图标：优先用显式传入的 valueIcon，其次从候选项里取 */
  const selectedIcon = valueIcon ?? selected?.icon;

  /** 关键词过滤：label 与 value 都参与匹配；空关键词保持原始顺序 */
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return normalized;
    return normalized.filter(
      (option) =>
        option.label.toLowerCase().includes(keyword) ||
        option.value.toLowerCase().includes(keyword),
    );
  }, [normalized, query]);

  // 展开面板：重置关键词、把高亮落到当前值、把焦点移进面板
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const index = optionsRef.current.findIndex(
      (option) => option.value === valueRef.current,
    );
    setActiveIndex(index >= 0 ? index : 0);
    const raf = requestAnimationFrame(() => {
      // 编辑模式的输入框已持有焦点，无需转移
      if (editableRef.current) return;
      if (searchRef.current) {
        searchRef.current.focus();
      } else {
        listRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // 收起时清空关键词，保证下次展开是完整列表
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // 关键词变化后高亮回到第一项
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 点击组件外部收起；编辑模式下顺带确认当前输入
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      if (editableRef.current) commitRef.current?.(valueRef.current);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  // 高亮项滚动进可视区
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  /** 选中某一项：值 + 确认 + 收起 */
  function selectOption(next: string) {
    onChange(next);
    onCommit?.(next);
    setOpen(false);
    (editable ? inputRef : triggerRef).current?.focus();
  }

  /** 编辑模式：提交当前手输内容 */
  function commitInput() {
    setOpen(false);
    onCommit?.(valueRef.current);
  }

  /** 面板里的键盘导航（编辑模式由输入框转发过来） */
  function handlePanelKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) =>
        filtered.length === 0
          ? 0
          : Math.min(index + 1, filtered.length - 1),
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = filtered[activeIndex];
      if (target) {
        selectOption(target.value);
      } else if (editable) {
        // 候选里没有匹配：把手输内容直接确认下来
        commitInput();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      (editable ? inputRef : triggerRef).current?.focus();
    }
  }

  /** 焦点离开整个组件（Tab 走 / 点到别处）时，编辑模式要确认内容 */
  function handleRootBlur(event: ReactFocusEvent<HTMLDivElement>) {
    if (rootRef.current?.contains(event.relatedTarget as Node)) return;
    setOpen(false);
    if (editable) onCommit?.(valueRef.current);
  }

  const activeOptionId =
    filtered[activeIndex] !== undefined
      ? `${listId}-option-${activeIndex}`
      : undefined;

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onBlur={handleRootBlur}
    >
      {editable ? (
        <div className="relative">
          {/* 编辑模式：当前值图标叠在输入框左侧，故输入框需要让出左内边距 */}
          {selectedIcon && (
            <OptionIcon
              src={selectedIcon}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            />
          )}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open ? activeOptionId : undefined}
            autoComplete="off"
            spellCheck={false}
            disabled={isDisabled}
            value={value}
            placeholder={placeholder}
            data-testid={testId}
            // 输入即过滤：同时更新受控值与候选关键词
            onChange={(event) => {
              onChange(event.target.value);
              setQuery(event.target.value);
              setOpen(true);
            }}
            onClick={() => setOpen(true)}
            onKeyDown={(event) => {
              // 面板已展开：方向键 / 回车 / Esc 交给面板统一处理
              // （输入框与面板是兄弟节点，事件不会自己冒泡过去）
              if (open) {
                handlePanelKeyDown(event);
                return;
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
              } else if (event.key === 'Enter') {
                // 面板已收起时回车 = 直接确认手输内容
                commitInput();
              } else if (event.key === 'Escape') {
                setOpen(false);
              }
            }}
            className={`${fieldAppearance} pr-9 ${selectedIcon ? 'pl-9' : ''}`}
          />
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-500" />
        </div>
      ) : (
        <button
          type="button"
          ref={triggerRef}
          disabled={isDisabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          data-testid={testId}
          onClick={() => setOpen((prev) => !prev)}
          onKeyDown={(event) => {
            // 面板未展开时，方向键也能唤起
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          className={`${fieldAppearance} flex cursor-pointer items-center justify-between gap-2 text-left`}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedIcon && <OptionIcon src={selectedIcon} />}
            <span className={`truncate ${value ? '' : 'text-brand-700/40'}`}>
              {loading
                ? '拉取中…'
                : (selected?.label ?? value) || placeholder}
            </span>
          </span>
          <ChevronDownIcon
            className={`h-4 w-4 shrink-0 text-brand-500 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
      )}

      {open && (
        <div
          onKeyDown={handlePanelKeyDown}
          className={`absolute z-20 mt-1 overflow-hidden rounded-xl border border-brand-100 bg-white shadow-lg shadow-brand-900/10 ${panelClassName}`}
        >
          {panelHeader && (
            // 头部插槽：拦下非 Esc 按键，避免内层控件的 Enter / 方向键
            // 冒泡到列表导航（否则按 Enter 会误选模型）；Esc 仍放行以关闭面板
            <div
              className="border-b border-brand-50 p-2"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') event.stopPropagation();
              }}
            >
              {panelHeader}
            </div>
          )}

          {showSearch && (
            <div className="border-b border-brand-50 p-1.5">
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索…"
                className="w-full rounded-lg bg-brand-50/70 px-2.5 py-1.5 text-xs text-brand-900 outline-none placeholder:text-brand-700/40"
              />
            </div>
          )}

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={editable ? undefined : activeOptionId}
            className="max-h-56 overflow-y-auto p-1 outline-none"
          >
            {filtered.length === 0 ? (
              <li className="px-2.5 py-2 text-xs text-brand-700/60">
                {emptyText}
              </li>
            ) : (
              filtered.map((option, index) => (
                <li
                  key={option.value}
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  data-active={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  // 阻止 mousedown 抢走焦点：否则编辑模式的输入框会先失焦触发一次多余确认
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option.value)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                    index === activeIndex
                      ? 'bg-brand-50 text-brand-700'
                      : // 已选中项常驻浅底 + 半粗，面板展开后一眼能定位当前生效值
                        option.value === value
                        ? 'bg-brand-50/60 font-semibold text-brand-700'
                        : 'text-brand-900'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {option.icon && <OptionIcon src={option.icon} />}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {option.value === value && (
                    <CheckIcon className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
