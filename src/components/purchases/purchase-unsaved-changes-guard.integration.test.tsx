// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactNode } from 'react';

import { PurchaseForm } from '@/components/purchases/purchase-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import type { Purchase } from '@/types/purchase';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { uid: 'user-1' }, isAuthenticated: true }),
}));

vi.mock('@/hooks/use-raw-materials-by-ids', () => ({
  useRawMaterialsByIds: () => ({
    rawMaterialsById: new Map(),
    isLoading: false,
    isFetching: false,
  }),
}));

vi.mock('@/actions/raw-materials', () => ({
  getRawMaterialAction: vi.fn(async () => ({
    success: true,
    data: {
      id: 'rm-2',
      code: 'SGR',
      name: 'Sugar',
      unit: 'kg',
      isActive: true,
    },
  })),
}));

vi.mock('@/components/shared/raw-material-picker-combobox', () => ({
  RawMaterialPickerCombobox: ({
    id,
    onValueChange,
  }: {
    id: string;
    onValueChange: (value: string) => void;
  }) => (
    <select id={id} aria-label="Raw material" onChange={(event) => onValueChange(event.target.value)}>
      <option value="">Select</option>
      <option value="rm-1">Flour</option>
      <option value="rm-2">Sugar</option>
    </select>
  ),
}));

const draftPurchase: Purchase = {
  id: 'purchase-1',
  organizationId: 'org-1',
  purchaseNumber: 'PUR-001',
  purchaseDate: '2026-08-24',
  supplierName: 'Flour Supplier',
  invoiceNumber: null,
  status: 'draft',
  paymentStatus: 'paid',
  lineItems: [
    {
      id: 'line-1',
      rawMaterialId: 'rm-1',
      rawMaterialCode: 'FLR',
      rawMaterialName: 'Flour',
      quantity: 10,
      unit: 'kg',
      unitCost: 1000,
      lineTotal: 10000,
      packCount: 1,
      packSize: 10,
      packPrice: 10000,
    },
  ],
  totalAmount: 10000,
  discountAmount: 0,
  adjustmentAmount: 0,
  lineItemCount: 1,
  notes: null,
  createdAt: new Date('2026-08-24T00:00:00.000Z'),
  createdBy: 'user-1',
  updatedAt: new Date('2026-08-24T00:00:00.000Z'),
  updatedBy: 'user-1',
  receivedAt: null,
  receivedBy: null,
  deletedAt: null,
  deletedBy: null,
};

function TestProviders({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function SidebarProductsLink() {
  return (
    <div data-slot="sidebar-menu-button">
      <a href="/products">
        <span>Products</span>
      </a>
    </div>
  );
}

function PurchaseEditGuardHarness() {
  const [isDirty, setIsDirty] = useState(false);
  const { unsavedChangesDialog } = useUnsavedChangesGuard(isDirty);

  return (
    <div>
      {unsavedChangesDialog}
      <SidebarProductsLink />
      <PurchaseForm
        formId="purchase-edit-form"
        purchase={draftPurchase}
        onSubmit={vi.fn(async () => undefined)}
        onDirtyChange={setIsDirty}
      />
    </div>
  );
}

function pointerDown(element: Element) {
  fireEvent.pointerDown(element, { button: 0, bubbles: true });
}

describe('Purchase unsaved-changes guard integration', () => {
  beforeEach(() => {
    mockPush.mockReset();
    window.history.pushState({}, '', '/purchases/purchase-1/edit');
  });

  afterEach(() => {
    cleanup();
  });

  it('marks the form dirty after editing a text field', async () => {
    render(<PurchaseEditGuardHarness />, { wrapper: TestProviders });

    fireEvent.change(screen.getByLabelText(/supplier name/i), {
      target: { value: 'Changed Supplier' },
    });

    await waitFor(() => {
      pointerDown(screen.getByRole('link', { name: 'Products' }));
      expect(screen.getByText('You have unsaved changes. Leave this page?')).toBeTruthy();
    });
  });

  it('marks the form dirty after changing a picker/select field', async () => {
    render(<PurchaseEditGuardHarness />, { wrapper: TestProviders });

    fireEvent.change(screen.getByLabelText('Raw material'), { target: { value: 'rm-2' } });

    await waitFor(() => {
      pointerDown(screen.getByRole('link', { name: 'Products' }));
      expect(screen.getByText('You have unsaved changes. Leave this page?')).toBeTruthy();
    });
  });

  it('blocks sidebar navigation while dirty and allows Stay', async () => {
    render(<PurchaseEditGuardHarness />, { wrapper: TestProviders });

    fireEvent.change(screen.getByLabelText(/supplier name/i), {
      target: { value: 'Changed Supplier' },
    });

    await waitFor(() => {
      pointerDown(screen.getByRole('link', { name: 'Products' }));
      expect(screen.getByText('Unsaved changes')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Changed Supplier')).toBeTruthy();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('continues navigation when the user chooses Leave', async () => {
    render(<PurchaseEditGuardHarness />, { wrapper: TestProviders });

    fireEvent.change(screen.getByLabelText(/supplier name/i), {
      target: { value: 'Changed Supplier' },
    });

    await waitFor(() => {
      pointerDown(screen.getByRole('link', { name: 'Products' }));
      expect(screen.getByText('Unsaved changes')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(mockPush).toHaveBeenCalledWith('/products');
  });

  it('allows navigation without a dialog when the form is clean', () => {
    render(<PurchaseEditGuardHarness />, { wrapper: TestProviders });

    pointerDown(screen.getByRole('link', { name: 'Products' }));

    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('registers beforeunload only when dirty', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<PurchaseEditGuardHarness />, { wrapper: TestProviders });

    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));

    fireEvent.change(screen.getByLabelText(/supplier name/i), {
      target: { value: 'Changed Supplier' },
    });

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});


