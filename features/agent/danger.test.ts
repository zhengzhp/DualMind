/**
 * 危险动作分类单测（纯函数，无 DOM）
 */
import { describe, expect, it } from 'vitest';
import { classifyDanger, isFinancialContext, isMutatingTool } from './danger';
import type { SnapshotElement } from './types';

function el(patch: Partial<SnapshotElement> & { index?: number }): SnapshotElement {
  return { index: patch.index ?? 0, tag: patch.tag ?? 'button', ...patch };
}

describe('isFinancialContext', () => {
  it('识别支付主机与 checkout 路径', () => {
    expect(isFinancialContext('https://www.paypal.com/cgi-bin')).toBe(true);
    expect(isFinancialContext('https://shop.example.com/checkout')).toBe(true);
    expect(isFinancialContext('https://example.com/docs')).toBe(false);
  });
});

describe('isMutatingTool', () => {
  it('snapshot / finish 只读；click / fill 为写', () => {
    expect(isMutatingTool('snapshot')).toBe(false);
    expect(isMutatingTool('finish')).toBe(false);
    expect(isMutatingTool('click')).toBe(true);
    expect(isMutatingTool('fill')).toBe(true);
  });
});

describe('classifyDanger', () => {
  it('读工具一律 safe', () => {
    expect(
      classifyDanger({
        tool: 'snapshot',
        args: { tool: 'snapshot' },
        pageUrl: 'https://www.paypal.com/',
      }).level,
    ).toBe('safe');
  });

  it('金融域写操作 blocked', () => {
    const r = classifyDanger({
      tool: 'click',
      args: { tool: 'click', index: 0 },
      element: el({ name: 'OK' }),
      pageUrl: 'https://checkout.stripe.com/c/pay/cs_test',
    });
    expect(r.level).toBe('blocked');
    expect(r.reasons[0]).toMatch(/金融|支付/);
  });

  it('普通提交需确认，支付文案不可确认放行', () => {
    expect(
      classifyDanger({
        tool: 'click',
        args: { tool: 'click', index: 1 },
        element: el({ tag: 'button', name: '提交反馈', inputType: 'submit' }),
        pageUrl: 'https://shop.example.com/cart',
      }).level,
    ).toBe('dangerous');

    expect(
      classifyDanger({
        tool: 'click',
        args: { tool: 'click', index: 1 },
        element: el({ tag: 'button', name: '立即支付' }),
        pageUrl: 'https://shop.example.com/cart',
      }).level,
    ).toBe('blocked');
  });

  it.each(['立即购买', '下单', '转账', '充值', 'checkout', 'pay now'])('非金融域的 %s 仍阻断', (name) => {
    expect(classifyDanger({
      tool: 'click', args: { tool: 'click', index: 0 },
      element: el({ name }), pageUrl: 'https://example.com/',
    }).level).toBe('blocked');
  });

  it('普通商品浏览不误判为支付，指向支付页的链接拒绝', () => {
    const element = el({ tag: 'a', name: '查看商品', href: 'https://shop.example.com/products/1' });
    expect(classifyDanger({ tool: 'click', args: {}, element, pageUrl: element.href }).level).toBe('safe');
    expect(classifyDanger({ tool: 'click', args: {}, element: { ...element, href: 'https://shop.example.com/checkout' }, pageUrl: element.href }).level).toBe('blocked');
  });

  it('普通文案不能掩盖支付提交地址与支付选项', () => {
    expect(classifyDanger({ tool: 'click', args: {}, element: el({ name: '继续', formAction: 'https://example.com/payment' }), pageUrl: 'https://example.com/form' }).level).toBe('blocked');
    expect(classifyDanger({ tool: 'select', args: { value: '立即支付' }, element: el({ tag: 'select', name: '操作方式' }), pageUrl: 'https://example.com/form' }).level).toBe('blocked');
  });

  it('删除文案 → dangerous', () => {
    expect(
      classifyDanger({
        tool: 'click',
        args: { tool: 'click', index: 0 },
        element: el({ name: '删除账号' }),
        pageUrl: 'https://example.com/settings',
      }).level,
    ).toBe('dangerous');
  });

  it('密码框 fill → dangerous', () => {
    expect(
      classifyDanger({
        tool: 'fill',
        args: { tool: 'fill', index: 0, value: 'x' },
        element: el({ tag: 'input', inputType: 'password' }),
        pageUrl: 'https://example.com/login',
      }).level,
    ).toBe('dangerous');
  });

  it('普通输入 fill → safe', () => {
    expect(
      classifyDanger({
        tool: 'fill',
        args: { tool: 'fill', index: 0, value: '张三' },
        element: el({ tag: 'input', inputType: 'text', name: '姓名' }),
        pageUrl: 'https://example.com/form',
      }).level,
    ).toBe('safe');
  });

  it('外链点击 → dangerous', () => {
    expect(
      classifyDanger({
        tool: 'click',
        args: { tool: 'click', index: 0 },
        element: el({
          tag: 'a',
          name: '外站',
          href: 'https://other.example/path',
        }),
        pageUrl: 'https://example.com/page',
      }).level,
    ).toBe('dangerous');
  });

  it('无元素上下文的 click 偏保守', () => {
    expect(
      classifyDanger({
        tool: 'click',
        args: { tool: 'click', index: 0 },
        pageUrl: 'https://example.com/',
      }).level,
    ).toBe('dangerous');
  });
});
