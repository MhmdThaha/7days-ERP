// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function SidebarProductsLink() {
  return (
    <div data-slot="sidebar-menu-button">
      <a href="/products">
        <span>Products</span>
      </a>
    </div>
  );
}

function GuardHarness({ isDirty }: { isDirty: boolean }) {
  const { unsavedChangesDialog } = useUnsavedChangesGuard(isDirty);

  return (
    <div>
      {unsavedChangesDialog}
      <SidebarProductsLink />
    </div>
  );
}

function pointerDown(element: Element) {
  fireEvent.pointerDown(element, { button: 0, bubbles: true });
}

describe('useUnsavedChangesGuard', () => {
  beforeEach(() => {
    mockPush.mockReset();
    window.history.pushState({}, '', '/purchases/purchase-1/edit');
  });

  afterEach(() => {
    cleanup();
  });

  it('allows navigation when the form is clean', () => {
    render(<GuardHarness isDirty={false} />);

    pointerDown(screen.getByRole('link', { name: 'Products' }));

    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('blocks navigation and offers Stay or Leave when dirty', () => {
    render(<GuardHarness isDirty={true} />);

    pointerDown(screen.getByRole('link', { name: 'Products' }));

    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.getByText('You have unsaved changes. Leave this page?')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('continues navigation when the user chooses Leave', () => {
    render(<GuardHarness isDirty={true} />);

    pointerDown(screen.getByRole('link', { name: 'Products' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(mockPush).toHaveBeenCalledWith('/products');
  });

  it('stays on the page when the user chooses Stay', () => {
    render(<GuardHarness isDirty={true} />);

    pointerDown(screen.getByRole('link', { name: 'Products' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('registers beforeunload when dirty and removes it when clean', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { rerender, unmount } = render(<GuardHarness isDirty={false} />);

    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));

    rerender(<GuardHarness isDirty={true} />);

    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    rerender(<GuardHarness isDirty={false} />);

    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    unmount();

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
