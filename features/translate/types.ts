export interface TranslateRequest {
  text: string;
  /** 可选覆盖目标语言；省略时划词中英互切（混排→中文） */
  targetLanguage?: string;
  signal?: AbortSignal;
}

export interface TranslateResult {
  sourceText: string;
  translatedText: string;
  targetLanguage: string;
}
