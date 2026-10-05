export interface TranslateRequest {
  text: string;
  /** 可选覆盖目标语言；默认读设置 */
  targetLanguage?: string;
  signal?: AbortSignal;
}

export interface TranslateResult {
  sourceText: string;
  translatedText: string;
  targetLanguage: string;
}
