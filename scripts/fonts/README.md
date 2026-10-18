# 字体子集（IBM Plex Sans / SC）

> 产物：`public/fonts/*.woff2`；许可证：`LICENSES/IBM-Plex-OFL.txt`。
> 接入点：`assets/tailwind.css` 的 @font-face、`shared/ui/fonts.ts`（内容脚本 shadow root）、
> 三个入口 HTML 的 400 字重 preload。

## 1. 体积与取舍

| 文件 | 内容 | 体积（约） |
|---|---|---|
| `IBMPlexSansVar-Roman.woff2` | 拉丁可变字体，100–700 | 39 KB |
| `IBMPlexSansSC-Regular.woff2` | 中文 UI 子集，400 | 94 KB |
| `IBMPlexSansSC-SemiBold.woff2` | 中文 UI 子集，600 | 96 KB |

合计约 **229 KB**，低于方案里的 320 KB 预算。中文只做 400 / 600 两档：
500 由浏览器在 400/600 之间选择/合成；正文不依赖 500 的精确字重。

## 2. 字符清单

`ui-chars.txt` 由 `extract-ui-chars.mjs` 生成：

```bash
node scripts/fonts/extract-ui-chars.mjs
```

只取 TypeScript 字符串 / 模板字符串 / JSX 文本里的汉字与中文标点，**不取注释**。
当前约 869 个字符、2.6 KB。文案新增中文后重跑此脚本，再重建字体。

## 3. 重建中文子集

需要 Python 的 `fonttools` + `brotli`：

```bash
python3 -m venv /tmp/dm-font-venv
/tmp/dm-font-venv/bin/pip install fonttools brotli
PYFTSUBSET=/tmp/dm-font-venv/bin/pyftsubset bash scripts/fonts/build-fonts.sh
```

脚本会从 npm 下载 `@ibm/plex-sans-sc@1.1.0`（OFL-1.1），解出完整 woff2 后：
```bash
pyftsubset IBMPlexSansSC-Regular.woff2 \
  --text-file=scripts/fonts/ui-chars.txt \
  --flavor=woff2 \
  --output-file=public/fonts/IBMPlexSansSC-Regular.woff2 \
  --layout-features='' --no-hinting
```
Semibold 同理。

## 4. 拉丁字体来源

拉丁字体用 Google Fonts CSS 的 **latin** 子集（可变字体，100–700）：

```bash
curl -A '<Chrome UA>' \
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap'
# 取 /* latin */ 段里的 woff2 URL，保存为 public/fonts/IBMPlexSansVar-Roman.woff2
```

它同时覆盖 400/500/600，避免为三个字重各存一份。

## 5. unicode-range 与兜底

- 拉丁：`U+0000-00FF ... U+2000-206F ...`
- 中文：`U+3000-303F, U+4E00-9FFF, U+FF00-FFEF`

中文范围故意宽于子集：范围命中但字形缺失时，浏览器按字体栈继续回退到
PingFang / 微软雅黑 / system-ui，不会出现豆腐块。模型返回的正文因此走系统字体，
不会因为子集缺字而报错。

## 6. 内容脚本

内容脚本的 shadow root 不能直接加载扩展相对路径；`shared/ui/fonts.ts` 用
`browser.runtime.getURL('fonts/...')` 生成 @font-face。字体文件在
`wxt.config.ts` 的 `web_accessible_resources` 中只开放 `fonts/*.woff2`。
