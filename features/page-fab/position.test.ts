/**
 * 悬浮入口位置计算的回归护栏。
 *
 * 这些函数决定「按钮会不会跑出视口点不到」与「静止时占多宽」，属于用户能直接
 * 感知的失败模式：夹取写错 → 拖到边缘后按钮消失；吸附判定写错 → 拖到左侧却弹回右侧。
 *
 * 两个坐标系必须分清（这是本文件最容易写错的地方）：
 * - **拖拽坐标** = 按钮（`size` 宽）的左边缘，拖拽时必须整体留在视口内；
 * - **落点坐标** = 壳（`peekWidth` 宽）的左边缘，壳的贴边侧边缘与视口边缘对齐。
 *
 * 鼠标与触屏是两套几何（把手 vs 全宽、40px vs 48px、阈值 4 vs 10），
 * 因此除个别只在某一端成立的用例，其余断言都用**同一套矩阵**跑两遍 ——
 * 触屏路径没有独立的断言就等于没有护栏。
 */
import { describe, expect, it } from 'vitest';
import {
  COARSE_GEOM,
  DEFAULT_GEOM,
  bottomFabY,
  clampFabX,
  clampFabY,
  defaultFabPos,
  fabAnchor,
  geometryForPointer,
  hasPeek,
  isDragGesture,
  maxFabX,
  minFabX,
  resolveFabPos,
  type FabGeometry,
  type FabSide,
} from './position';

const viewport = { width: 1000, height: 800 };

const GEOMS: Array<[string, FabGeometry]> = [
  ['鼠标', DEFAULT_GEOM],
  ['触屏', COARSE_GEOM],
];

/** 已贴边时，按钮（`size` 宽）左边缘的位置 —— 即 `resolveFabPos` 的入参坐标系 */
function dockedButtonLeft(side: FabSide, geo: FabGeometry): number {
  return side === 'right' ? viewport.width - geo.size : 0;
}

describe('geometryForPointer', () => {
  it('按主指针是否粗糙选几何', () => {
    expect(geometryForPointer(false)).toBe(DEFAULT_GEOM);
    expect(geometryForPointer(true)).toBe(COARSE_GEOM);
  });

  it('触屏：更大、不启用把手、阈值更宽（手指精度低于鼠标）', () => {
    expect(COARSE_GEOM.size).toBeGreaterThan(DEFAULT_GEOM.size);
    expect(COARSE_GEOM.peekWidth).toBe(COARSE_GEOM.size);
    expect(COARSE_GEOM.dragThreshold).toBeGreaterThan(DEFAULT_GEOM.dragThreshold);
    // 触控目标不小于 Material 建议的 48dp
    expect(COARSE_GEOM.size).toBeGreaterThanOrEqual(48);
  });
});

describe('hasPeek', () => {
  it('鼠标档启用窄把手（有悬停可以把它唤出来）', () => {
    expect(hasPeek(DEFAULT_GEOM)).toBe(true);
    expect(DEFAULT_GEOM.peekWidth).toBeLessThan(DEFAULT_GEOM.size);
    // 0 宽会让静止时完全看不见；太宽则失去「最不占正文」的意义
    expect(DEFAULT_GEOM.peekWidth).toBeGreaterThan(0);
    /*
     * 下限 12px：8px 试过，实机反馈「太不明显，用户注意不到」——
     * 这么窄时把手连内部的抓手点都放不下，读起来只是页面上的白条。
     */
    expect(DEFAULT_GEOM.peekWidth).toBeGreaterThanOrEqual(12);
  });

  it('触屏档不启用：没有悬停，露出的把手得靠手指盲点，十几像素点不中', () => {
    expect(hasPeek(COARSE_GEOM)).toBe(false);
  });
});

describe('贴边位（minFabX / maxFabX）', () => {
  it('贴左：壳的左边缘就是视口的左边缘', () => {
    expect(minFabX()).toBe(0);
    // 归一化 `-0`：负零会一路漏进样式（`left: -0px`）与断言里
    expect(Object.is(minFabX(), -0)).toBe(false);
  });

  it('贴右：壳只有把手宽，右边缘与视口右边缘对齐', () => {
    expect(maxFabX(1000, DEFAULT_GEOM)).toBe(1000 - DEFAULT_GEOM.peekWidth);
    // 触屏不启用把手 → 退回「全宽贴边」，仍然紧贴视口边缘
    expect(maxFabX(1000, COARSE_GEOM)).toBe(1000 - COARSE_GEOM.size);
  });
});

describe.each(GEOMS)('clampFabY（%s）', (_name, geo) => {
  it('视口内的 y 原样保留', () => {
    expect(clampFabY(300, 800, geo)).toBe(300);
  });

  it('小于上边距时贴到上边距', () => {
    expect(clampFabY(-120, 800, geo)).toBe(geo.margin);
  });

  it('超出底部可达范围时贴到底部', () => {
    expect(clampFabY(9000, 800, geo)).toBe(bottomFabY(800, geo));
    expect(bottomFabY(800, geo)).toBe(800 - geo.size - geo.margin);
  });

  it('非有限值（脏数据）回落到贴底，不产生 NaN 样式', () => {
    expect(clampFabY(Number.NaN, 800, geo)).toBe(bottomFabY(800, geo));
    expect(clampFabY(Number.POSITIVE_INFINITY, 800, geo)).toBe(
      bottomFabY(800, geo),
    );
  });

  it('视口高度过小时仍给出可达位置（不小于上边距）', () => {
    expect(clampFabY(0, 20, geo)).toBe(geo.margin);
  });
});

describe.each(GEOMS)('clampFabX（%s）', (_name, geo) => {
  it('视口内原样保留', () => {
    expect(clampFabX(400, 1000, geo)).toBe(400);
  });

  it('左越界夹到 0：拖拽中按钮必须整体留在视口内', () => {
    expect(clampFabX(-500, 1000, geo)).toBe(0);
    expect(Object.is(clampFabX(-500, 1000, geo), -0)).toBe(false);
  });

  it('右越界夹到「按钮右边缘贴住视口右边」', () => {
    expect(clampFabX(5000, 1000, geo)).toBe(1000 - geo.size);
  });

  it('非有限值（脏数据）回落到右边界，不产生 NaN 样式', () => {
    expect(clampFabX(Number.NaN, 1000, geo)).toBe(1000 - geo.size);
  });

  it('视口比按钮还窄时仍给出确定值（不返回 NaN / 视口内溢出）', () => {
    expect(clampFabX(500, 20, geo)).toBe(20 - geo.size);
  });
});

describe.each(GEOMS)('defaultFabPos（%s）', (_name, geo) => {
  it('默认右下角', () => {
    expect(defaultFabPos(viewport, geo)).toEqual({
      side: 'right',
      y: bottomFabY(800, geo),
    });
  });
});

describe.each(GEOMS)('resolveFabPos（%s）', (_name, geo) => {
  it('中心在左半屏则吸附左侧', () => {
    expect(resolveFabPos(100, 200, viewport, geo).side).toBe('left');
  });

  it('中心在右半屏则吸附右侧', () => {
    expect(resolveFabPos(700, 200, viewport, geo).side).toBe('right');
  });

  it('居中偏左（中心恰在中线左侧）吸附左侧，避免「看起来该在左却弹到右」', () => {
    expect(
      resolveFabPos(viewport.width / 2 - geo.size, 200, viewport, geo).side,
    ).toBe('left');
  });

  it('已停在右吸附位时仍判为右侧，不会来回跳', () => {
    expect(
      resolveFabPos(dockedButtonLeft('right', geo), 200, viewport, geo).side,
    ).toBe('right');
  });

  it('已停在左吸附位时仍判为左侧', () => {
    expect(
      resolveFabPos(dockedButtonLeft('left', geo), 200, viewport, geo).side,
    ).toBe('left');
  });

  it('y 越界时一并夹回视口', () => {
    expect(resolveFabPos(900, 9999, viewport, geo).y).toBe(bottomFabY(800, geo));
    expect(resolveFabPos(900, -5, viewport, geo).y).toBe(geo.margin);
  });
});

describe.each(GEOMS)('fabAnchor（%s）', (_name, geo) => {
  it('贴边侧边缘与视口边缘对齐', () => {
    const right = fabAnchor({ side: 'right', y: 300 }, viewport, geo);
    expect(right).toEqual({ left: maxFabX(viewport.width, geo), top: 300 });
    expect(right.left + geo.peekWidth).toBe(viewport.width);

    const left = fabAnchor({ side: 'left', y: 300 }, viewport, geo);
    expect(left).toEqual({ left: minFabX(), top: 300 });
    expect(left.left).toBe(0);
  });

  it('按钮是朝页面内侧生长的，因此展开后也整块在视口内（不会长出屏幕）', () => {
    for (const side of ['left', 'right'] as const) {
      const anchor = fabAnchor({ side, y: 300 }, viewport, geo);
      // 按钮（size 宽）贴着壳的贴边侧，展开后占据 [anchorLeft, anchorLeft + size) 或
      // (anchorLeft + peekWidth - size, anchorLeft + peekWidth]
      const buttonLeft =
        side === 'right' ? anchor.left + geo.peekWidth - geo.size : anchor.left;
      expect(buttonLeft).toBeGreaterThanOrEqual(0);
      expect(buttonLeft + geo.size).toBeLessThanOrEqual(viewport.width);
    }
  });

  it('读取到的旧位置超出当前视口时被夹取（换小窗口后仍可点）', () => {
    expect(fabAnchor({ side: 'left', y: 2000 }, viewport, geo).top).toBe(
      bottomFabY(viewport.height, geo),
    );
  });

  it('跟随视口宽度变化（换窄窗口后仍贴在右边缘）', () => {
    const narrow = { width: 400, height: 800 };
    expect(fabAnchor({ side: 'right', y: 100 }, narrow, geo).left).toBe(
      maxFabX(narrow.width, geo),
    );
  });
});

describe('fabAnchor · 静止时占位的对照（两种几何的差异点）', () => {
  it('鼠标静止只占一个把手宽，触屏占满（没有悬停可唤出，必须一直全宽）', () => {
    const mouse = fabAnchor({ side: 'right', y: 300 }, viewport, DEFAULT_GEOM);
    const touch = fabAnchor({ side: 'right', y: 300 }, viewport, COARSE_GEOM);
    expect(viewport.width - mouse.left).toBe(DEFAULT_GEOM.peekWidth);
    expect(viewport.width - touch.left).toBe(COARSE_GEOM.size);
  });

  it('触屏也能贴到真正的视口边缘（不会因为不启用把手而「离边一截」）', () => {
    expect(fabAnchor({ side: 'right', y: 0 }, viewport, COARSE_GEOM).left).toBe(
      viewport.width - COARSE_GEOM.size,
    );
  });
});

describe.each(GEOMS)('isDragGesture（%s）', (_name, geo) => {
  it('低于阈值不算拖拽（避免手抖把点击变成拖动）', () => {
    expect(isDragGesture(1, 1, geo)).toBe(false);
  });

  it('达到阈值即算拖拽', () => {
    expect(isDragGesture(geo.dragThreshold, 0, geo)).toBe(true);
    expect(isDragGesture(0, -geo.dragThreshold, geo)).toBe(true);
  });

  it('斜向位移按欧氏距离判定', () => {
    expect(isDragGesture(3, 4, DEFAULT_GEOM)).toBe(true); // 5px
  });

  it('触屏阈值更宽：鼠标下算拖拽的位移，手指按下时可能只是抖动', () => {
    // 同一段 5px 斜向位移：鼠标算拖拽，触屏不算
    expect(isDragGesture(3, 4, DEFAULT_GEOM)).toBe(true);
    expect(isDragGesture(3, 4, COARSE_GEOM)).toBe(false);
  });
});
