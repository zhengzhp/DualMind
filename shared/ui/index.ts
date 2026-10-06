/**
 * 共享 UI 组件（Options 页 / Side Panel / 全页工作台通用）。
 * 这里只放纯展示组件，不依赖任何 storage / messaging，保持可测试。
 */
export { fieldClass } from './field';
export { CheckIcon, ChevronDownIcon, RefreshIcon } from './icons';
export {
  SegmentedControl,
  type SegmentedControlOption,
  type SegmentedControlProps,
} from './SegmentedControl';
export {
  SearchableSelect,
  type SearchableSelectItem,
  type SearchableSelectOption,
  type SearchableSelectProps,
} from './SearchableSelect';
export {
  detectModelVendorId,
  getModelIconUrl,
  toModelOptions,
} from './modelIcons';
