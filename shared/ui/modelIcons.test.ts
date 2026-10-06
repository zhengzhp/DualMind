import { describe, expect, it } from 'vitest';
import { detectModelVendorId } from './modelIcons';

/**
 * 模型名 → 厂商识别：规则顺序敏感（具体关键词在前），这里用真实模型名固化行为，
 * 防止后续调整规则时把「codellama 识别不出」这类问题带进来。
 */
describe('detectModelVendorId', () => {
  it('识别国内主流模型', () => {
    expect(detectModelVendorId('deepseek-r1:14b')).toBe('deepseek');
    expect(detectModelVendorId('deepseek-chat')).toBe('deepseek');
    expect(detectModelVendorId('qwen2.5-coder:7b')).toBe('qwen');
    expect(detectModelVendorId('qwq:32b')).toBe('qwen');
    expect(detectModelVendorId('glm4:9b')).toBe('chatglm');
    expect(detectModelVendorId('chatglm3')).toBe('chatglm');
    expect(detectModelVendorId('kimi-k2')).toBe('kimi');
    expect(detectModelVendorId('moonshot-v1-8k')).toBe('moonshot');
    expect(detectModelVendorId('yi:34b')).toBe('yi');
    expect(detectModelVendorId('baichuan2:13b')).toBe('baichuan');
    expect(detectModelVendorId('minimax-abab6.5')).toBe('minimax');
    expect(detectModelVendorId('doubao-pro-32k')).toBe('doubao');
    expect(detectModelVendorId('ernie-4.0')).toBe('baidu');
    expect(detectModelVendorId('internlm2:20b')).toBe('internlm');
    expect(detectModelVendorId('hunyuan-pro')).toBe('tencent');
    expect(detectModelVendorId('step-2-16k')).toBe('stepfun');
  });

  it('识别国际主流模型', () => {
    expect(detectModelVendorId('gpt-4o-mini')).toBe('openai');
    expect(detectModelVendorId('o3-mini')).toBe('openai');
    expect(detectModelVendorId('chatgpt-4o-latest')).toBe('openai');
    expect(detectModelVendorId('claude-3-5-sonnet')).toBe('anthropic');
    expect(detectModelVendorId('gemini-1.5-pro')).toBe('gemini');
    expect(detectModelVendorId('gemini-2.0-flash')).toBe('gemini');
    expect(detectModelVendorId('gemma2:2b')).toBe('gemma');
    expect(detectModelVendorId('llama3.2:latest')).toBe('meta');
    expect(detectModelVendorId('codellama:13b')).toBe('meta');
    expect(detectModelVendorId('mistral:7b')).toBe('mistral');
    expect(detectModelVendorId('codestral:22b')).toBe('mistral');
    expect(detectModelVendorId('phi3:mini')).toBe('microsoft');
    expect(detectModelVendorId('command-r-plus')).toBe('cohere');
    expect(detectModelVendorId('nemotron-4:15b')).toBe('nvidia');
    expect(detectModelVendorId('granite3-dense:8b')).toBe('ibm');
    expect(detectModelVendorId('falcon3:7b')).toBe('tii');
    expect(detectModelVendorId('llava:13b')).toBe('llava');
    expect(detectModelVendorId('snowflake-arctic')).toBe('snowflake');
    expect(detectModelVendorId('hermes3:8b')).toBe('nousresearch');
    expect(detectModelVendorId('solar-pro')).toBe('upstage');
    expect(detectModelVendorId('jamba-1.5-mini')).toBe('ai21');
    expect(detectModelVendorId('exaone3.5:7.8b')).toBe('lg');
    expect(detectModelVendorId('stabilitylm-2')).toBe('stability');
    expect(detectModelVendorId('grok-2')).toBe('grok');
  });

  it('大小写与分隔符不影响识别', () => {
    expect(detectModelVendorId('DeepSeek-R1')).toBe('deepseek');
    expect(detectModelVendorId('QWEN2.5')).toBe('qwen');
    expect(detectModelVendorId('LLAMA3.1:70b')).toBe('meta');
  });

  it('未收录的厂商 / 通用模型返回 null（宁可不显示图标，也不猜错）', () => {
    expect(detectModelVendorId('')).toBe(null);
    expect(detectModelVendorId('   ')).toBe(null);
    expect(detectModelVendorId('mxbai-embed-large')).toBe(null);
    expect(detectModelVendorId('nomic-embed-text')).toBe(null);
    expect(detectModelVendorId('starcoder2:3b')).toBe(null);
    expect(detectModelVendorId('dbrx-instruct')).toBe(null);
    expect(detectModelVendorId('olmo2:7b')).toBe(null);
  });

  it('易混淆规则的优先级正确', () => {
    // llava 必须在 meta(llama) 之前，否则会被 llama 规则误吃
    expect(detectModelVendorId('llava:7b')).toBe('llava');
    // gemma / gemini 必须在 google 之前
    expect(detectModelVendorId('gemma:7b')).toBe('gemma');
    expect(detectModelVendorId('gemini-pro')).toBe('gemini');
    // grok 必须在 xai 之前
    expect(detectModelVendorId('grok-beta')).toBe('grok');
    // phind 不能被 phi(微软) 规则误吃
    expect(detectModelVendorId('phind-codellama:34b')).toBe('phind');
    // 混血模型 dolphin-mistral 归到实际底座厂商
    expect(detectModelVendorId('dolphin-mistral:7b')).toBe('mistral');
  });
});
