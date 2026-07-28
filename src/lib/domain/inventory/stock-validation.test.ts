import { describe, expect, it } from 'vitest';

import { DomainError } from '@/lib/domain/errors';
import { assertSufficientStock } from '@/lib/domain/inventory/stock-validation';

describe('assertSufficientStock', () => {
  it('allows deductions that leave zero stock', () => {
    expect(() => assertSufficientStock(10, 10, 'Flour')).not.toThrow();
  });

  it('allows deductions with stock remaining', () => {
    expect(() => assertSufficientStock(10, 4, 'Flour')).not.toThrow();
  });

  it('throws when stock would become negative', () => {
    expect(() => assertSufficientStock(3, 5, 'Flour')).toThrow(DomainError);
    expect(() => assertSufficientStock(3, 5, 'Flour')).toThrow(
      'Insufficient stock for "Flour". Available: 3, required: 5',
    );
  });

  it('throws when stock is zero and quantity is required', () => {
    expect(() => assertSufficientStock(0, 1, 'Sugar')).toThrow(DomainError);
  });
});
