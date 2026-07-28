'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { computeFloatingListPosition } from '@/lib/utils/combobox-position';
import { cn } from '@/lib/utils';

export type ItemComboboxOption = {
  value: string;
  label: string;
  disabled?: boolean;
  keywords?: string;
  /** Non-selectable section label shown above option groups. */
  isSectionHeader?: boolean;
};

export type ItemComboboxProps = {
  id?: string;
  value: string | null;
  onValueChange: (value: string) => void;
  options: ItemComboboxOption[];
  placeholder?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  disabled?: boolean;
  className?: string;
  /** When false, options are shown as-is (for server-side search). Defaults to true. */
  filterOptions?: boolean;
  /** Called when the search query changes (including when the list closes). */
  onQueryChange?: (query: string) => void;
  /** Shows a loading row while server-side options are being fetched. */
  isLoadingOptions?: boolean;
  /** Friendly error message when server-side options fail to load. */
  optionsErrorMessage?: string;
  /** Retries loading server-side options after a failure. */
  onRetryOptions?: () => void;
  /** Called when the combobox input receives focus. */
  onFocus?: () => void;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

type ListPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
};

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

export function ItemCombobox({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Search…',
  emptyMessage = 'No matches found.',
  loadingMessage = 'Searching…',
  disabled = false,
  className,
  filterOptions = true,
  onQueryChange,
  isLoadingOptions = false,
  optionsErrorMessage,
  onRetryOptions,
  onFocus,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: ItemComboboxProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [listPosition, setListPosition] = useState<ListPosition>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 240,
    placement: 'bottom',
  });

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    if (!filterOptions) {
      return options;
    }

    const term = normalizeSearch(query);

    if (!term) {
      return options;
    }

    return options.filter((option) => {
      const haystack = normalizeSearch(`${option.label} ${option.keywords ?? ''}`);
      return haystack.includes(term);
    });
  }, [filterOptions, options, query]);

  const selectableOptions = useMemo(
    () => filteredOptions.filter((option) => !option.disabled && !option.isSectionHeader),
    [filteredOptions],
  );

  const effectiveActiveIndex =
    selectableOptions.length === 0
      ? 0
      : Math.min(activeIndex, selectableOptions.length - 1);

  const updateListPosition = useCallback(() => {
    const anchor = containerRef.current;

    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();

    setListPosition(
      computeFloatingListPosition({
        anchorRect: rect,
        viewportHeight: window.innerHeight,
      }),
    );
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updateListPosition();
  }, [isOpen, updateListPosition, filteredOptions.length]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleReposition() {
      updateListPosition();
    }

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updateListPosition]);

  const closeList = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setActiveIndex(0);
    onQueryChange?.('');
  }, [onQueryChange]);

  const selectOption = useCallback(
    (option: ItemComboboxOption) => {
      if (option.disabled) {
        return;
      }

      onValueChange(option.value);
      closeList();
      inputRef.current?.blur();
    },
    [closeList, onValueChange],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (containerRef.current?.contains(target) || listRef.current?.contains(target)) {
        return;
      }

      closeList();
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [closeList, isOpen]);

  function handleInputChange(nextQuery: string) {
    setQuery(nextQuery);
    onQueryChange?.(nextQuery);
    setIsOpen(true);
    setActiveIndex(0);
  }

  function handleInputFocus() {
    onFocus?.();

    if (!disabled) {
      setIsOpen(true);
    }
  }

  function handleInputBlur(event: React.FocusEvent<HTMLInputElement>) {
    const relatedTarget = event.relatedTarget as Node | null;

    if (
      relatedTarget &&
      (containerRef.current?.contains(relatedTarget) || listRef.current?.contains(relatedTarget))
    ) {
      return;
    }

    closeList();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        selectableOptions.length === 0
          ? 0
          : Math.min(current + 1, selectableOptions.length - 1),
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      if (!isOpen || selectableOptions.length === 0) {
        return;
      }

      event.preventDefault();
      const option = selectableOptions[effectiveActiveIndex];

      if (option) {
        selectOption(option);
      }

      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeList();
      inputRef.current?.blur();
    }
  }

  const displayValue = isOpen ? query : (selectedOption?.label ?? '');

  const listbox = isOpen ? (
    <ul
      ref={listRef}
      id={listboxId}
      role="listbox"
      style={{
        position: 'fixed',
        top: listPosition.top,
        left: listPosition.left,
        width: listPosition.width,
        maxHeight: listPosition.maxHeight,
      }}
      className="z-[100] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      {optionsErrorMessage ? (
        <li className="px-2 py-2">
          <p className="text-sm text-destructive">{optionsErrorMessage}</p>
          {onRetryOptions ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-7"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onRetryOptions}
            >
              Try again
            </Button>
          ) : null}
        </li>
      ) : isLoadingOptions && filteredOptions.length === 0 ? (
        <li className="px-2 py-2 text-sm text-muted-foreground">{loadingMessage}</li>
      ) : filteredOptions.length === 0 ? (
        <li className="px-2 py-2 text-sm text-muted-foreground">{emptyMessage}</li>
      ) : (
        filteredOptions.map((option) => {
          if (option.isSectionHeader) {
            return (
              <li
                key={option.value}
                role="presentation"
                className="px-2 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {option.label}
              </li>
            );
          }

          const selectableIndex = selectableOptions.findIndex(
            (item) => item.value === option.value,
          );
          const isActive = selectableIndex === effectiveActiveIndex;
          const isSelected = option.value === value;

          return (
            <li
              key={option.value}
              role="option"
              aria-selected={isSelected}
              aria-disabled={option.disabled}
              className={cn(
                'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none',
                option.disabled
                  ? 'cursor-not-allowed text-muted-foreground opacity-50'
                  : 'hover:bg-accent hover:text-accent-foreground',
                isActive && !option.disabled && 'bg-accent text-accent-foreground',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
              onMouseEnter={() => {
                if (!option.disabled && selectableIndex >= 0) {
                  setActiveIndex(selectableIndex);
                }
              }}
            >
              <Check
                className={cn('size-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')}
                aria-hidden="true"
              />
              <span className="truncate">{option.label}</span>
            </li>
          );
        })
      )}
    </ul>
  ) : null;

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          value={displayValue}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          className="pr-9"
        />
        <ChevronsUpDown
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </div>

      {typeof document !== 'undefined' && listbox ? createPortal(listbox, document.body) : null}
    </div>
  );
}
