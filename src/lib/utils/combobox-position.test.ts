import { describe, expect, it } from 'vitest';

import { computeFloatingListPosition } from '@/lib/utils/combobox-position';

describe('computeFloatingListPosition', () => {
  it('opens downward when there is enough space below', () => {
    const result = computeFloatingListPosition({
      anchorRect: { top: 100, bottom: 132, left: 16, width: 320 },
      viewportHeight: 800,
    });

    expect(result.placement).toBe('bottom');
    expect(result.top).toBe(136);
    expect(result.maxHeight).toBe(240);
  });

  it('flips upward when space below is limited', () => {
    const result = computeFloatingListPosition({
      anchorRect: { top: 620, bottom: 652, left: 16, width: 320 },
      viewportHeight: 700,
    });

    expect(result.placement).toBe('top');
    expect(result.top).toBeLessThan(620);
    expect(result.maxHeight).toBeGreaterThan(0);
  });

  it('caps max height to available viewport space', () => {
    const result = computeFloatingListPosition({
      anchorRect: { top: 640, bottom: 672, left: 16, width: 320 },
      viewportHeight: 700,
    });

    expect(result.maxHeight).toBeLessThanOrEqual(240);
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(700);
  });
});
