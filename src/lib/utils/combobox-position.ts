export type FloatingListPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
};

type ComputeFloatingListPositionInput = {
  anchorRect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>;
  viewportHeight: number;
  preferredMaxHeight?: number;
  viewportPadding?: number;
  gap?: number;
  minHeight?: number;
  flipThreshold?: number;
};

/**
 * Computes fixed positioning for a combobox listbox so it stays within the viewport.
 * Flips above the anchor when there is insufficient space below.
 */
export function computeFloatingListPosition({
  anchorRect,
  viewportHeight,
  preferredMaxHeight = 240,
  viewportPadding = 8,
  gap = 4,
  minHeight = 120,
  flipThreshold = 160,
}: ComputeFloatingListPositionInput): FloatingListPosition {
  const spaceBelow = viewportHeight - anchorRect.bottom - viewportPadding;
  const spaceAbove = anchorRect.top - viewportPadding;
  const openUpward = spaceBelow < flipThreshold && spaceAbove > spaceBelow;
  const availableSpace = openUpward ? spaceAbove - gap : spaceBelow - gap;
  const maxHeight = Math.max(minHeight, Math.min(preferredMaxHeight, availableSpace));

  return {
    left: anchorRect.left,
    width: anchorRect.width,
    maxHeight,
    placement: openUpward ? 'top' : 'bottom',
    top: openUpward ? anchorRect.top - gap - maxHeight : anchorRect.bottom + gap,
  };
}
