import type { SearchableSelectOption } from './SearchableSelect';

/**
 * 模型图标：把模型名匹配到厂商品牌图标，供模型下拉候选与「当前选中模型」展示。
 *
 * 为什么需要：模型名（`deepseek-r1:14b` / `qwen2.5-coder:7b`）本身看不出属于谁家，
 * 在名称前加品牌图标，用户一眼就能确认「我正在用哪个产品」。
 *
 * 图标资源：`public/model-icons/<id>.svg`，取自开源图标集
 * `@lobehub/icons-static-svg`（优先使用 `-color` 品牌色变体，无则用单色变体）。
 * WXT 会把 `public/` 原样拷到产物根目录，故运行期经 `runtime.getURL('/model-icons/x.svg')` 访问。
 *
 * 匹配策略：按下面的规则表**先匹配先命中**，规则只覆盖确有图标文件的厂商；
 * 未命中一律返回 null（不显示图标），宁可没有图标，也不猜错厂商。
 */

/** 一条识别规则：命中 `pattern` 即认为属于厂商 `id`（对应一个图标文件） */
interface VendorRule {
  id: string;
  pattern: RegExp;
}

/**
 * 顺序敏感：越具体 / 越独占的关键词排在前面，避免被更宽泛的规则抢先命中。
 * 例：`grok` 必须在 `xai` 之前，`gemma` 必须在 `google` 之前，`phind` 必须在 `phi` 之前。
 */
const VENDOR_RULES: readonly VendorRule[] = [
  // —— 国内主流 ——
  { id: 'deepseek', pattern: /deepseek/i },
  // 用子串匹配而非前置边界：真实模型名常带前缀（codeqwen / qwen2.5-coder）
  { id: 'qwen', pattern: /(qwen|qwq)/i },
  { id: 'kimi', pattern: /kimi/i },
  { id: 'moonshot', pattern: /moonshot/i },
  { id: 'chatglm', pattern: /(^|[^a-z0-9])(glm|chatglm|glmv?)/i },
  { id: 'zhipu', pattern: /zhipu/i },
  { id: 'baichuan', pattern: /baichuan/i },
  { id: 'minimax', pattern: /(minimax|abab)/i },
  { id: 'doubao', pattern: /(doubao|skylark)/i },
  { id: 'bytedance', pattern: /bytedance/i },
  { id: 'baidu', pattern: /(ernie|wenxin|baidu)/i },
  { id: 'internlm', pattern: /internlm/i },
  { id: 'spark', pattern: /(spark|iflytek|xinghuo)/i },
  { id: 'stepfun', pattern: /(stepfun|(^|[^a-z0-9])step[-_]?[0-9])/i },
  { id: 'tencent', pattern: /(hunyuan|tencent)/i },
  { id: 'huaweicloud', pattern: /(pangu|huawei)/i },
  { id: 'modelscope', pattern: /modelscope/i },
  { id: 'alibabacloud', pattern: /(alibaba|alibabacloud)/i },
  { id: 'yi', pattern: /(^|[^a-z0-9])(yi|zeroone|01-ai)([^a-z0-9]|$)/i },

  // —— 推理平台 / 网关 ——
  { id: 'groq', pattern: /groq/i },
  { id: 'grok', pattern: /(^|[^a-z0-9])grok/i },
  { id: 'xai', pattern: /(^|[^a-z0-9])xai/i },
  { id: 'perplexity', pattern: /(perplexity|sonar)/i },
  { id: 'openrouter', pattern: /openrouter/i },
  { id: 'together', pattern: /together/i },
  { id: 'fireworks', pattern: /fireworks/i },
  { id: 'bedrock', pattern: /bedrock/i },
  { id: 'azure', pattern: /azure/i },
  { id: 'sambanova', pattern: /sambanova/i },
  { id: 'cerebras', pattern: /cerebras/i },
  { id: 'snowflake', pattern: /(snowflake|arctic)/i },
  { id: 'voyage', pattern: /voyage/i },
  { id: 'jina', pattern: /jina/i },
  { id: 'huggingface', pattern: /(huggingface|(^|[^a-z0-9])hf[-_])/i },

  // —— 开源 / 各家模型 ——
  { id: 'nvidia', pattern: /(nemotron|nvidia)/i },
  { id: 'ibm', pattern: /(granite|(^|[^a-z0-9])ibm)/i },
  { id: 'tii', pattern: /falcon/i },
  { id: 'reka', pattern: /reka/i },
  { id: 'upstage', pattern: /(^|[^a-z0-9])(solar|upstage)/i },
  { id: 'ai21', pattern: /(jamba|ai21)/i },
  { id: 'nousresearch', pattern: /hermes/i },
  { id: 'llava', pattern: /llava/i },
  { id: 'phind', pattern: /phind/i },
  { id: 'lg', pattern: /(exaone|(^|[^a-z0-9])lg[-_])/i },
  { id: 'stability', pattern: /(stability|stable[-_]?(diffusion|lm|code))/i },
  { id: 'microsoft', pattern: /(microsoft|orcas|(^|[^a-z0-9])phi[-_]?[0-9])/i },
  { id: 'cohere', pattern: /(^|[^a-z0-9])(command|aya|c4ai)/i },
  { id: 'mistral', pattern: /(mistral|mixtral|codestral|devstral|magistral|pixtral|ministral)/i },
  // llama 用子串匹配：codellama / tinyllama / vicuna-llama 等带前缀变体很常见
  { id: 'meta', pattern: /(llama|(^|[^a-z0-9])meta)/i },
  { id: 'gemma', pattern: /gemma/i },
  { id: 'gemini', pattern: /(gemini|(^|[^a-z0-9])(palm|bard))/i },
  { id: 'google', pattern: /google/i },
  { id: 'anthropic', pattern: /claude/i },
  {
    id: 'openai',
    // gpt-4o / o1 / o3-mini / chatgpt / text-embedding / whisper / dall-e
    pattern: /(^|[^a-z0-9])(gpt|chatgpt|davinci|whisper|dall-?e|text-embedding|o[1-4])([^a-z0-9]|$)/i,
  },
  { id: 'ollama', pattern: /ollama/i },
];

/** 图标 URL 缓存：列表与触发器会重复解析同一模型名，缓存可避免重复正则匹配 */
const iconUrlCache = new Map<string, string | null>();

/**
 * 由模型名识别厂商 id（对应 `public/model-icons/<id>.svg`）。
 * 未命中返回 null —— 调用方据此决定不显示图标。
 */
export function detectModelVendorId(model: string): string | null {
  const name = model.trim();
  if (!name) return null;
  for (const rule of VENDOR_RULES) {
    if (rule.pattern.test(name)) return rule.id;
  }
  return null;
}

/** 由模型名解析图标 URL；未命中或不在扩展环境（如单测）时返回 null */
export function getModelIconUrl(model: string): string | null {
  if (!model) return null;
  const cached = iconUrlCache.get(model);
  if (cached !== undefined) return cached;

  const id = detectModelVendorId(model);
  let url: string | null = null;
  if (id && typeof browser !== 'undefined' && browser.runtime?.getURL) {
    try {
      // WXT 的 `getURL` 入参在类型层被收窄为编译期已知的 public 路径字面量；
      // 这里按厂商 id 运行期拼接动态路径，故显式放宽为 string 入参。
      const getUrl = browser.runtime.getURL as (path: string) => string;
      url = getUrl(`/model-icons/${id}.svg`);
    } catch {
      url = null;
    }
  }
  iconUrlCache.set(model, url);
  return url;
}

/**
 * 把模型名数组包装成带厂商图标的候选项，供 `SearchableSelect` 直接使用。
 * 识别不出厂商的模型不加图标（`icon` 留空）。
 */
export function toModelOptions(
  names: readonly string[],
): SearchableSelectOption[] {
  return names.map((name) => ({
    value: name,
    label: name,
    icon: getModelIconUrl(name) ?? undefined,
  }));
}
