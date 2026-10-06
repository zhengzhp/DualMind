import type { SVGProps } from 'react';

/** 下拉箭头（用于 select / 自绘下拉） */
export function ChevronDownIcon({
  className = '',
  ...rest
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path
        d="M5.5 8l4.5 4.5L14.5 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 刷新（用于把「刷新模型列表」压成图标，节省横向空间） */
export function RefreshIcon({ className = '', ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {/* 270° 圆弧 + 顶部箭头：缺口朝右上，视觉上「转一圈」刷新 */}
      <path
        d="M16 10a6 6 0 1 1-6-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M7.5 1.6 10 4 7.5 6.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 选中对勾 */
export function CheckIcon({ className = '', ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path
        d="M4.5 10.5l3.5 3.5 7.5-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
