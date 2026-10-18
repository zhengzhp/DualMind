import {
  Check,
  ChevronDown,
  PanelLeft,
  RefreshCw,
  Settings,
  type LucideProps,
} from 'lucide-react';

/**
 * 共享图标统一走 Lucide（tree-shaking 后按需打包）。
 * 保留原来的导出名，调用方无需改动；描边统一 1.6，与文字层级一致。
 */
function iconProps({ className = '', ...rest }: LucideProps): LucideProps {
  return {
    'aria-hidden': true,
    strokeWidth: 1.6,
    className,
    ...rest,
  };
}

/** 下拉箭头（用于 select / 自绘下拉） */
export function ChevronDownIcon(props: LucideProps) {
  return <ChevronDown {...iconProps(props)} />;
}

/** 刷新（用于把「刷新模型列表」压成图标，节省横向空间） */
export function RefreshIcon(props: LucideProps) {
  return <RefreshCw {...iconProps(props)} />;
}

/** 选中对勾 */
export function CheckIcon(props: LucideProps) {
  return <Check {...iconProps(props)} />;
}

/** 工作台（全页）入口：外框 + 左侧栏，表达「把面板展开成一页」 */
export function WorkspaceIcon(props: LucideProps) {
  return <PanelLeft {...iconProps(props)} />;
}

/** 设置：齿轮轮廓 */
export function SettingsIcon(props: LucideProps) {
  return <Settings {...iconProps(props)} />;
}
