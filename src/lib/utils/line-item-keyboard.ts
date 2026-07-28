/** Shared keyboard navigation helpers for line-item data entry forms. */

export function focusElementById(elementId: string, options?: { afterAppend?: boolean }): void {
  const focus = () => {
    const element = document.getElementById(elementId);

    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: false });
    }
  };

  if (options?.afterAppend) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(focus);
    });
    return;
  }

  window.requestAnimationFrame(focus);
}

export function handleEnterAsTab(event: React.KeyboardEvent, nextElementId: string): void {
  if (event.key !== 'Enter') {
    return;
  }

  event.preventDefault();
  focusElementById(nextElementId);
}
