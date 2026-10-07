/**
 * 危险动作分类（纯函数）
 * 不确定时偏保守 → dangerous；金融 / 支付域写操作 → blocked
 */
import type {
  AgentToolArgs,
  AgentToolName,
  DangerAssessment,
  SnapshotElement,
} from './types';

/** 读操作：批准计划后可自动跑 */
const READ_TOOLS = new Set<AgentToolName>([
  'snapshot',
  'extract_text',
  'wait',
  'scroll',
  'finish',
]);

const SUBMIT_RE =
  /提交|确认提交|立即提交|\bsubmit\b|\bsend\b|确认$|确定$|sign\s*up|注册|登录|\blog\s*in\b|\bsign\s*in\b/i;

const PAY_RE =
  /支付|付款|结账|checkout|pay\s*now|立即购买|购买|下单|purchase|donate|捐款|充值|提现|转账|\btransfer\b|付款码/i;

const DELETE_RE =
  /删除|清空|清除全部|注销账号|cancel\s*account|\bdelete\b|remove\s*all|永久删除/i;

/** 主机名 / 路径启发式：金融支付域 */
const FINANCIAL_HOST_RE =
  /(^|\.)(paypal|stripe|alipay|tenpay|squareup|braintree|adyen|checkout)\./i;

const FINANCIAL_HOST_KEYWORDS_RE =
  /paypal|alipay|tenpay|stripe\.com|pay\.google|apple\.com|checkout\.shopify|worldpay|klarna|afterpay|venmo|cashapp/i;

const FINANCIAL_PATH_RE =
  /\/(checkout|payment|pay|billing|wallet|transfer|withdraw|recharge)(\/|$|\?)/i;

export interface ClassifyDangerInput {
  tool: AgentToolName;
  args: AgentToolArgs | Record<string, unknown>;
  /** 最近一次 snapshot 中对应元素（click/fill 等） */
  element?: SnapshotElement | null;
  pageUrl?: string;
}

function elementLabel(el?: SnapshotElement | null): string {
  if (!el) return '';
  return [el.name, el.placeholder, el.value, el.href, el.inputType, el.tag]
    .filter(Boolean)
    .join(' ');
}

/**
 * 当前页是否像金融 / 支付语境（整任务写操作默认阻断）
 */
export function isFinancialContext(pageUrl?: string): boolean {
  if (!pageUrl) return false;
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return FINANCIAL_HOST_KEYWORDS_RE.test(pageUrl) || FINANCIAL_PATH_RE.test(pageUrl);
  }
  const host = url.hostname;
  if (FINANCIAL_HOST_RE.test(host) || FINANCIAL_HOST_KEYWORDS_RE.test(host)) {
    return true;
  }
  if (FINANCIAL_PATH_RE.test(url.pathname)) return true;
  return false;
}

function isExternalNavigation(
  pageUrl: string | undefined,
  href: string | undefined,
): boolean {
  if (!href || !href.trim()) return false;
  const h = href.trim();
  if (h.startsWith('#') || h.startsWith('javascript:')) return false;
  if (h.startsWith('mailto:') || h.startsWith('tel:')) return true;
  try {
    const target = new URL(h, pageUrl || 'https://example.invalid');
    if (!pageUrl) {
      return target.protocol === 'http:' || target.protocol === 'https:';
    }
    const current = new URL(pageUrl);
    // 离开当前 origin，或换到明显不同的 path（整页跳转）
    if (target.origin !== current.origin) return true;
    // 同源但非纯 hash 的导航也标危险（偏保守）
    if (target.pathname !== current.pathname || target.search !== current.search) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * 对拟执行的工具调用分级
 */
export function classifyDanger(input: ClassifyDangerInput): DangerAssessment {
  const { tool, element, pageUrl } = input;
  const reasons: string[] = [];

  if (READ_TOOLS.has(tool)) {
    return { level: 'safe', reasons: [] };
  }

  const financial = isFinancialContext(pageUrl);
  if (financial) {
    return {
      level: 'blocked',
      reasons: ['当前页疑似金融 / 支付相关，V3.0 拒绝自动执行写操作'],
    };
  }

  const label = elementLabel(element);

  if (tool === 'click') {
    const inputType = element?.inputType?.toLowerCase();
    // input[type=submit] 或 button 默认 type=submit → 可能提交表单
    if (inputType === 'submit') {
      reasons.push('点击提交控件');
    } else if (
      element?.tag === 'button' &&
      (!inputType || inputType === 'submit')
    ) {
      reasons.push('可能提交表单的 button');
    }
    if (PAY_RE.test(label)) reasons.push('文案疑似支付 / 下单');
    if (SUBMIT_RE.test(label)) reasons.push('文案疑似提交 / 登录');
    if (DELETE_RE.test(label)) reasons.push('文案疑似删除 / 清空');
    if (isExternalNavigation(pageUrl, element?.href)) {
      reasons.push('可能离开当前页');
    }
    if (reasons.length === 0 && !element) {
      reasons.push('无元素上下文，点击偏保守确认');
    }
  }

  if (tool === 'type' || tool === 'fill') {
    const t = element?.inputType?.toLowerCase();
    if (t === 'password') reasons.push('操作密码框');
    if (t === 'file') reasons.push('操作文件上传');
    if (DELETE_RE.test(label)) reasons.push('目标文案疑似清空 / 删除');
  }

  if (tool === 'select' && PAY_RE.test(label)) {
    reasons.push('下拉项语境疑似支付');
  }

  // 支付文案在非金融域仍为 dangerous（二次确认），不升为 blocked
  if (reasons.length > 0) {
    return { level: 'dangerous', reasons };
  }

  return { level: 'safe', reasons: [] };
}

/** 是否写操作（金融域阻断用） */
export function isMutatingTool(tool: AgentToolName): boolean {
  return !READ_TOOLS.has(tool);
}
