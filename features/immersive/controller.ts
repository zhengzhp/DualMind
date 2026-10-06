/**
 * 沉浸式翻译控制器（Content 侧）。
 *
 * 职责：采集正文 → 分批（并发受控）→ 调用 Background 翻译 → 渲染译文 →
 * 维护进度与错误态 → MutationObserver 增量补译动态内容。
 */
import { formatErrorForUi } from '@/shared/errors';
import { sendMessage } from '@/shared/messaging/client';
import {
  TARGET_LANGUAGES,
  type ImmersiveDisplayMode,
} from '@/shared/storage/types';
import { isTargetLanguage } from '@/features/translate/detectLang';
import { chunkSegments } from './batch';
import { createImmersiveClient, type ImmersiveClient } from './client';
import { ImmersiveRenderer } from './renderer';
import { collectSegments, type CollectedSegment } from './segmenter';
import type { ImmersiveStatus } from './types';

/** 同一时刻最多在途批次数：兼顾速度与本地模型压力 */
const MAX_CONCURRENT_BATCHES = 3;
/** 动态内容增量采集的防抖时长 */
const OBSERVER_DEBOUNCE_MS = 500;

type StatusListener = (status: ImmersiveStatus) => void;

/**
 * 视口优先级：越靠近视口中心的片段越先翻译，
 * 让用户先看到眼前内容，而不是从页首顺序等待。
 */
function viewportDistance(el: Element): number {
  try {
    const rect = el.getBoundingClientRect();
    const viewportCenter =
      (typeof window !== 'undefined' ? window.innerHeight : 0) / 2;
    return Math.abs(rect.top - viewportCenter);
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * 目标语言的可读名称（取自界面同款语言标签，未知代码退回原样）。
 * 用于「正文已是目标语言」这类提示，避免向用户抛出 `zh-CN` 这种原始码。
 */
function describeLanguage(code: string): string {
  return TARGET_LANGUAGES.find((item) => item.value === code)?.label ?? code;
}

export class ImmersiveController {
  private readonly client: ImmersiveClient;
  private readonly renderer: ImmersiveRenderer;
  /** 全部已采集片段：id → 片段（含源元素） */
  private readonly segments = new Map<string, CollectedSegment>();
  /** 已处理过的元素，避免重复采集（WeakSet 不阻止元素被回收） */
  private seen = new WeakSet<Element>();

  private abort: AbortController | null = null;
  private observer: MutationObserver | null = null;
  private flushTimer: number | undefined;
  /** 是否有正在进行的翻译批次（避免增量采集与首轮翻译并发叠加） */
  private processing = false;
  /** 处理中出现新动态内容时置位，本轮结束后再补扫一次 */
  private rescanQueued = false;

  private targetLanguage = 'zh-CN';
  private displayMode: ImmersiveDisplayMode = 'bilingual';
  private active = false;
  private running = false;
  private done = 0;
  private total = 0;
  private untranslated = 0;
  private error = '';
  /**
   * 当前会话中「整批失败」的片段 id 集合。
   * 后续若补译成功会从中移除，因此 `error` 能如实反映「还有几段没译出来」，
   * 而不是把部分失败伪装成成功（见 docs/decisions.md 的残留观察）。
   */
  private readonly failedIds = new Set<string>();
  /** 最近一次失败的用户可见原因，与 failedIds 拼成同一条提示 */
  private failureReason = '';

  constructor(private readonly onStatus: StatusListener) {
    this.client = createImmersiveClient();
    this.renderer = new ImmersiveRenderer('bilingual');
  }

  getStatus(): ImmersiveStatus {
    return {
      available: true,
      active: this.active,
      running: this.running,
      displayMode: this.displayMode,
      done: this.done,
      total: this.total,
      untranslated: this.untranslated,
      error: this.error || undefined,
    };
  }

  setDisplayMode(mode: ImmersiveDisplayMode): void {
    this.displayMode = mode;
    this.renderer.setMode(mode);
  }

  /** 开始整页翻译；已处于激活态时仅同步展示模式 */
  async start(mode?: ImmersiveDisplayMode): Promise<void> {
    if (mode) this.setDisplayMode(mode);
    if (this.active) {
      this.emit();
      return;
    }

    this.resetFailure();
    try {
      const settings = await sendMessage('settings:get', undefined);
      this.targetLanguage = settings.targetLanguage;
    } catch (err) {
      this.error = formatErrorForUi(err);
      this.emit();
      return;
    }

    const { collected, fresh } = this.collectForTranslation();
    if (fresh.length === 0) {
      if (collected.length > 0) {
        // 采到了片段，但它们全被判为「已是目标语言」，本次未产生任何译文。
        // 必须回退采集标记：否则这些元素已被 seen 记录，下次（例如用户改完
        // 目标语言后）会整体跳过，永远停在 0 段——正是「换了语言仍报错」的成因。
        this.seen = new WeakSet<Element>();
      }
      this.error =
        collected.length === 0
          ? '当前页面没有可翻译的正文内容'
          : `当前页面正文已是${describeLanguage(this.targetLanguage)}，无需翻译`;
      this.emit();
      return;
    }

    for (const segment of fresh) this.segments.set(segment.id, segment);
    this.active = true;
    this.total = this.segments.size;
    this.syncProgress();
    this.abort = new AbortController();
    this.emit();
    this.setupObserver();
    await this.processSegments(fresh, this.abort.signal);
  }

  /**
   * 采集正文并过滤掉「已经是目标语言」的片段。
   * 这类片段无需翻译，且本就是诱发模型「整批原样抄写」的因素之一；
   * 过滤后 `total` 与实际待译量一致，回显也就只可能是真实的漏译。
   *
   * 同时回传未过滤的原始采集量：两种 0 段（页面真的没有正文 / 正文已是目标
   * 语言）成因完全不同，调用方需要据此给出准确提示，而不是一律报「没有正文」。
   */
  private collectForTranslation(): {
    collected: CollectedSegment[];
    fresh: CollectedSegment[];
  } {
    const collected = collectSegments(document.body, { seen: this.seen });
    const fresh = collected.filter(
      (segment) => !isTargetLanguage(segment.text, this.targetLanguage),
    );
    return { collected, fresh };
  }

  stop(): void {
    this.abort?.abort();
    this.abort = null;
    this.observer?.disconnect();
    this.observer = null;
    if (this.flushTimer !== undefined) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.renderer.clear();
    this.segments.clear();
    this.seen = new WeakSet<Element>();

    this.active = false;
    this.running = false;
    this.processing = false;
    this.rescanQueued = false;
    this.done = 0;
    this.total = 0;
    this.untranslated = 0;
    this.resetFailure();
    this.emit();
  }

  /** 从渲染层同步进度计数（已渲染 / 未翻译） */
  private syncProgress(): void {
    this.done = this.renderer.size();
    this.untranslated = this.renderer.untranslatedCount();
  }

  /**
   * 依据失败片段集合刷新错误文案。
   * - 无失败片段 → 清空（覆盖「上一轮的错误已过期」这种情况）
   * - 有失败片段 → 「有 N 段翻译失败：原因」，保留到下一次 start / stop
   */
  private refreshFailure(): void {
    if (this.failedIds.size === 0) {
      this.resetFailure();
      return;
    }
    this.error = this.failureReason
      ? `有 ${this.failedIds.size} 段翻译失败：${this.failureReason}`
      : `有 ${this.failedIds.size} 段翻译失败，可重试`;
  }

  /** 清空失败态（新一轮开始 / 停止 / 全部失败片段已补译成功） */
  private resetFailure(): void {
    this.error = '';
    this.failedIds.clear();
    this.failureReason = '';
  }

  async toggle(mode?: ImmersiveDisplayMode): Promise<void> {
    if (this.active) {
      this.stop();
      return;
    }
    await this.start(mode);
  }

  /** 页面上下文失效时调用：停止翻译并断开 Port */
  dispose(): void {
    this.stop();
    this.client.dispose();
  }

  private emit(): void {
    this.onStatus(this.getStatus());
  }

  /**
   * 分批翻译并渲染。
   * 用固定数量的 worker 消费同一队列，实现「并发上限」而不丢失 abort 语义。
   */
  private async processSegments(
    list: CollectedSegment[],
    signal: AbortSignal,
  ): Promise<void> {
    this.processing = true;
    this.running = true;
    this.emit();

    const ordered = [...list].sort(
      (a, b) => viewportDistance(a.el) - viewportDistance(b.el),
    );
    const queue = chunkSegments(
      ordered.map(({ id, text }) => ({ id, text })),
    );

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        if (signal.aborted) return;
        const batch = queue.shift();
        if (!batch) return;
        try {
          const results = await this.client.translateBatch(
            batch,
            this.targetLanguage,
            signal,
          );
          if (signal.aborted) return;
          this.renderer.apply(results, this.segments);
          // 这些片段此前若失败过（本轮重试 / 后续补译成功），从失败集合中移除，
          // 让提示能随真实进度消失，而不是永久挂在界面上
          for (const result of results) this.failedIds.delete(result.id);
          this.syncProgress();
          this.emit();
        } catch (err) {
          if (signal.aborted) return;
          const message = formatErrorForUi(err);
          if (message === '已取消') return;
          // 整批失败：如实计入失败片段，不掩盖「部分失败」
          for (const item of batch) this.failedIds.add(item.id);
          this.failureReason = message;
          this.refreshFailure();
          this.emit();
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(MAX_CONCURRENT_BATCHES, queue.length) },
        worker,
      ),
    );

    this.processing = false;

    if (signal.aborted) return;
    this.running = false;
    // 收口错误态：所有失败片段都被补译成功才清空，否则保留「N 段翻译失败」。
    // 既不把部分失败伪装成成功，也不让旧提示永久挂着（下一次 start / stop 亦清空）。
    this.refreshFailure();
    if (this.rescanQueued) {
      // 首轮翻译期间页面又长出新内容 → 再补扫一次
      this.rescanQueued = false;
      this.scheduleIncremental();
    }
    this.emit();
  }

  private setupObserver(): void {
    if (this.observer || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver((records) => {
      let hasAdditions = false;
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof Element)) continue;
          // 自己注入的译文 / 样式节点不触发再翻译
          if (node.hasAttribute('data-dualmind')) continue;
          hasAdditions = true;
        }
        if (record.removedNodes.length > 0) {
          this.renderer.purgeDisconnected();
        }
      }
      if (hasAdditions) this.scheduleIncremental();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    this.observer = observer;
  }

  private scheduleIncremental(): void {
    if (this.flushTimer !== undefined) window.clearTimeout(this.flushTimer);
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = undefined;
      void this.runIncremental();
    }, OBSERVER_DEBOUNCE_MS);
  }

  private async runIncremental(): Promise<void> {
    if (!this.active || !this.abort) return;
    if (this.processing) {
      // 本轮还在跑，等它结束后统一补扫
      this.rescanQueued = true;
      return;
    }

    const { fresh } = this.collectForTranslation();
    if (fresh.length === 0) return;

    for (const segment of fresh) this.segments.set(segment.id, segment);
    this.total = this.segments.size;
    await this.processSegments(fresh, this.abort.signal);
  }
}
