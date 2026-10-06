/**
 * 通用页面正文片段（`features/page-content/` 共享层）。
 *
 * 与具体业务解耦：沉浸式翻译（immersive）与聊天上下文（chat）都消费它，
 * 因此这里只描述「一段正文」本身，不引入任何 feature 的领域字段
 * （如沉浸译的 `untranslated`、聊天的引用元信息等）。
 */

/** 一个可从页面中提取的正文片段（id 在一次采集内唯一） */
export interface PageSegment {
  id: string;
  text: string;
}

/** 采集结果：附带源元素引用，供渲染层在其后插入译文等使用 */
export interface CollectedSegment extends PageSegment {
  el: Element;
}
