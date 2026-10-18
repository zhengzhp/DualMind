# DualMind 品牌标识规范 v1

> 状态：**已定稿**（2026-10-18）。适用于扩展图标、页内悬浮入口、商店封面与 README。
> 设计来源：MasterGo 画布（`DualMind-logo-scratch`）三轮迭代 + 16px 实测；生产文件在 `assets/` 与 `public/icon/`。
> 视觉规范见 [ui-refresh-plan.md](./ui-refresh-plan.md) §11；规范图见 [assets/ui-refresh/brand-sheet.png](./assets/ui-refresh/brand-sheet.png)。

## 1. 标志构成

**双页（Two pages）**：左侧短页 + 右侧 D 形页，中间一条竖向折缝。折缝是真正挖空的负形（透明），不是画上去的白线。

- 读法：整体外轮廓是一个 D；折缝暗示"原文 / 译文"两页。
- 极简：只有两个几何元素（D 形 + 折缝），没有渐变、没有描边、没有投影。

## 2. 几何参数（主标，viewBox 240×280）

| 项 | 值 |
|---|---|
| 外轮廓 | 左直边 + 右半圆 |
| 圆角 | 左 22，右 140（右缘为半圆） |
| 折缝 | 宽 20、左内缩 30、上下各留 30、圆角 4 |
| 宽高比 | 240 : 280（约 0.857） |
| 填充 | 单色；浅底用 `#0F2F4D`，深底用 `#FFFFFF` |

## 3. 响应式（四级）

| 场景 | 用法 |
|---|---|
| 16 / 32 px 工具栏图标 | **实心简化标**（去掉折缝）——6px 标记里折缝不可见 |
| 48 / 128 px 应用图标 | 带折缝主标；图标底板 96×96 + 16 边距、圆角 22、品牌蓝 `#1466AD` |
| 组合标（横 / 竖） | 主标 + 字标；横版总宽约 385，竖版约 300×128 |
| 纯字标 | 页头使用；字标资产沿用 `public/wordmark.svg` |

## 4. 颜色

| 角色 | 值 | 用途 |
|---|---|---|
| 品牌蓝 | `#1466AD` | 图标底板、主按钮、链接 |
| 墨蓝 | `#0F2F4D` | 标记单色版、标题 |
| 画布 | `#F2F2F4` | 浅色界面底 |
| 白 | `#FFFFFF` | 深底反白、卡片 |

> 深色场景一律用反白版；不要把品牌蓝改成别的蓝。

## 5. 最小尺寸与安全边距

- 标记最小 **16px**；组合标最小宽度 **120px**。
- 四周留白 ≥ **1x**，x = 折缝宽度（主标为 20/240 ≈ 8.3% 标记宽度）。
- 与其它元素并置时，用留白分隔，不加分隔线。

## 6. 禁用

- 不拉伸 / 压扁（宽高比固定 240:280）。
- 不加描边、投影、渐变或多色。
- 不把折缝宽度改回 3.5%（16px 会消失）。
- 不在 16px 强行保留折缝（用实心简化标）。
- 不旋转、不裁切、不把标记放进非品牌色的圆底。

## 7. 文件清单

| 文件 | 说明 |
|---|---|
| `assets/logo.svg` | 浅色底方块版（128，渐变底板 + 墨蓝标记；悬浮入口沿用其圆形底板与折缝契约） |
| `assets/logo-mark-blue.svg` | 品牌蓝底板 + 反白标记（128） |
| `assets/logo-lockup.svg` | 横版组合标 |
| `assets/logo-lockup-vertical.svg` | 竖版组合标 |
| `public/icon/16,32,48,128.png` | 扩展图标（已替换） |
| `public/wordmark.svg` / `public/wordmark-dark.svg` | 浅色 / 深色字标（同几何，仅换色） |
| `public/fonts/*.woff2` + `LICENSES/IBM-Plex-OFL.txt` | IBM Plex Sans 拉丁可变字体、SC 中文 UI 子集与 OFL 许可证；重建见 `scripts/fonts/README.md` |
| `docs/assets/ui-refresh/logo-mark.svg` | 主标（currentColor + mask 挖空，供封面/文档使用） |
| `docs/assets/ui-refresh/brand-sheet.png` | 一页纸规范图 |

## 8. 变更记录

- 2026-10-18：由旧「双 D」升级为「双页」；图标四档替换；页内悬浮入口内联标记与 `assets/logo.svg` 同步更新（`dom.test.ts` 通过）。
- 2026-10-18（UI 审查后）：`logo-lockup*.svg` 的标记改用 §2 定义的 240×280 主标坐标（原为 128 空间副本），与 `docs/assets/ui-refresh/logo-mark.svg` 同源；页头字标改为内联组件，墨色 / 品牌色走 token，删除 `dm-wordmark-light/dark` 双资源切换。
