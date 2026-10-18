/**
 * 从 UI 源码里提取需要进入中文子集的字符。
 *
 * 只取「字符串 / 模板字符串 / JSX 文本」，不取注释 —— 否则注释里的汉字会把
 * 子集体积撑大，而注释永远不会显示给用户。
 *
 * 用法（仓库根目录）：
 *   node scripts/fonts/extract-ui-chars.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const roots = ['entrypoints', 'features', 'shared'];
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(p);
  }
};
for (const root of roots) walk(root);

const chars = new Set();
// 常用中文 / 全角标点；即使当前文案没出现，也保留基本标点，避免以后加标点就缺字
const extra = '，。！？：；、（）【】「」『』《》〈〉…—·～￥％＃＆＊＋－／＝＠｜“”‘’';
for (const ch of extra) chars.add(ch);

const addText = (text) => {
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef) ||
      (code >= 0x2000 && code <= 0x206f)
    ) {
      chars.add(ch);
    }
  }
};

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isJsxText(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      addText(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const sorted = [...chars].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
fs.writeFileSync(
  path.resolve('scripts/fonts/ui-chars.txt'),
  sorted.join(''),
  'utf8',
);
console.log(`wrote ${sorted.length} chars to scripts/fonts/ui-chars.txt`);
