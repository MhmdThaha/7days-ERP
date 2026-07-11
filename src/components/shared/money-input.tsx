'use client';

import { useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  formatMoneyInputDisplay,
  minorUnitsToDisplayValue,
  parseMoneyInput,
  sanitizeMoneyText,
} from '@/lib/utils/money';
import { cn } from '@/lib/utils';

type MoneyInputProps = {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

function countDigitsBefore(value: string, index: number): number {
  return value.slice(0, index).replace(/[^0-9]/g, '').length;
}

function caretIndexForDigitCount(formatted: string, digitCount: number): number {
  if (digitCount <= 0) {
    return 0;
  }

  let digits = 0;

  for (let index = 0; index < formatted.length; index += 1) {
    const char = formatted.charAt(index);

    if (/[0-9]/.test(char)) {
      digits += 1;

      if (digits >= digitCount) {
        return index + 1;
      }
    }
  }

  return formatted.length;
}

export function MoneyInput({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [draftText, setDraftText] = useState('');

  const sanitizedDraft = sanitizeMoneyText(draftText);
  const displayValue = isFocused
    ? formatMoneyInputDisplay(sanitizedDraft)
    : formatMoneyInputDisplay(minorUnitsToDisplayValue(value));

  return (
    <div className={cn('relative', className)}>
      <span
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground"
        aria-hidden="true"
      >
        ₹
      </span>
      <Input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="pl-7 tabular-nums"
        placeholder="0.00"
        value={displayValue}
        onFocus={() => {
          setIsFocused(true);
          setDraftText(minorUnitsToDisplayValue(value));
        }}
        onChange={(event) => {
          const input = event.target;
          const caretBefore = input.selectionStart ?? 0;
          const digitsBeforeCaret = countDigitsBefore(input.value, caretBefore);
          const sanitized = sanitizeMoneyText(event.target.value);
          const formatted = formatMoneyInputDisplay(sanitized);

          setDraftText(sanitized);

          if (!sanitized) {
            onChange(0);
          } else {
            const parsed = parseMoneyInput(sanitized);

            if (parsed !== null && parsed >= 0) {
              onChange(parsed);
            }
          }

          requestAnimationFrame(() => {
            const nextInput = inputRef.current;

            if (!nextInput) {
              return;
            }

            const nextCaret = caretIndexForDigitCount(formatted, digitsBeforeCaret);
            nextInput.setSelectionRange(nextCaret, nextCaret);
          });
        }}
        onBlur={() => {
          setIsFocused(false);

          if (!sanitizedDraft.trim()) {
            onChange(0);
            onBlur?.();
            return;
          }

          const parsed = parseMoneyInput(sanitizedDraft);

          if (parsed !== null && parsed > 0) {
            onChange(parsed);
            onBlur?.();
            return;
          }

          onChange(value > 0 ? value : 0);
          onBlur?.();
        }}
      />
    </div>
  );
}
