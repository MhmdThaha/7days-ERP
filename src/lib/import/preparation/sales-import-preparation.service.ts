/**
 * Sales Import Preparation — enriches mapped/normalized rows before Review.
 *
 * Pure: no Firestore, no sales execution, no inventory.
 */

import {
  hasNormalizedCustomerName,
  normalizeCustomerNameForSale,
} from '@/lib/import/preparation/sales-customer-semantics';
import {
  hasNormalizedSaleNumber,
  MISSING_INVOICE_NUMBER_WARNING_MESSAGE,
  normalizeSaleNumberForImport,
  PREPARATION_INVOICE_WARNING,
} from '@/lib/import/preparation/sales-invoice-semantics';
import type { NormalizedMappedRow } from '@/lib/import/preparation/sales-import-preparation.types';
import {
  calculateLineTotalMajor,
  deriveUnitPriceMajor,
  hasMoneyValue,
  moneyValuesConsistent,
  PREPARATION_MONEY_ERROR,
  readQuantity,
} from '@/lib/import/preparation/sales-money-semantics';
import {
  hasNormalizedSaleDate,
  ImportPreparationError,
  isoDateToNormalizedValue,
  type PrepareSalesImportInput,
  type PrepareSalesImportResult,
  type PreparedFieldSources,
  type SalesPreparationState,
} from '@/lib/import/preparation/sales-import-preparation.types';
import {
  mappingIncludesSaleDate,
  mappingIncludesTargetField,
} from '@/lib/import/preparation/sales-mapping-requirements';

type SalesPreparationRule = (state: SalesPreparationState) => SalesPreparationState;

const SALES_PREPARATION_RULES: SalesPreparationRule[] = [
  applySaleDateRule,
  applyCustomerRule,
  applySaleNumberRule,
  applyMoneySemanticsRule,
];

export function prepareSalesImport(input: PrepareSalesImportInput): PrepareSalesImportResult {
  let state: SalesPreparationState = {
    rows: input.rows.map((row) => ({
      ...row,
      values: { ...row.values },
    })),
    mapping: input.mapping,
    context: input.context,
    summary: {},
    rowProvenance: new Map<number, PreparedFieldSources>(),
    rowBlockingErrors: new Map(),
    rowWarnings: new Map(),
  };

  for (const rule of SALES_PREPARATION_RULES) {
    state = rule(state);
  }

  return {
    rows: state.rows,
    summary: state.summary,
    rowProvenance: state.rowProvenance,
    rowBlockingErrors: state.rowBlockingErrors,
    rowWarnings: state.rowWarnings,
  };
}

function applySaleDateRule(state: SalesPreparationState): SalesPreparationState {
  const saleDateMapped = mappingIncludesSaleDate(state.mapping);

  if (saleDateMapped) {
    const rowProvenance = new Map(state.rowProvenance);

    for (const row of state.rows) {
      if (hasNormalizedSaleDate(row.values['saleDate'])) {
        rowProvenance.set(row.rowNumber, {
          ...rowProvenance.get(row.rowNumber),
          saleDate: 'imported',
        });
      }
    }

    return {
      ...state,
      rowProvenance,
    };
  }

  const bulkSaleDate = state.context.bulkSaleDate?.trim();

  if (!bulkSaleDate) {
    throw new ImportPreparationError(
      'A sale date is required. Choose a date for this import because no Sale Date column was mapped.',
    );
  }

  const normalizedDate = isoDateToNormalizedValue(bulkSaleDate);
  const rows = state.rows.map((row) => ({
    ...row,
    values: {
      ...row.values,
      saleDate: normalizedDate,
    },
  }));
  const rowProvenance = new Map(state.rowProvenance);

  for (const row of rows) {
    rowProvenance.set(row.rowNumber, {
      ...rowProvenance.get(row.rowNumber),
      saleDate: 'user_entered',
    });
  }

  return {
    ...state,
    rows,
    rowProvenance,
    summary: {
      ...state.summary,
      bulkSaleDateApplied: {
        value: bulkSaleDate,
        source: 'user_entered',
        rowCount: rows.length,
      },
    },
  };
}

function applyCustomerRule(state: SalesPreparationState): SalesPreparationState {
  const rowProvenance = new Map(state.rowProvenance);
  const rows = state.rows.map((row) => {
    const values = { ...row.values };
    const provenance: PreparedFieldSources = { ...rowProvenance.get(row.rowNumber) };

    if (hasNormalizedCustomerName(values['customerName'])) {
      values['customerName'] = normalizeCustomerNameForSale(values['customerName']);
      provenance.customerName = 'imported';
    } else {
      values['customerName'] = null;
      provenance.customerName = 'defaulted';
    }

    rowProvenance.set(row.rowNumber, provenance);

    return { ...row, values };
  });

  return {
    ...state,
    rows,
    rowProvenance,
  };
}

function applySaleNumberRule(state: SalesPreparationState): SalesPreparationState {
  const rowProvenance = new Map(state.rowProvenance);
  const rowWarnings = new Map(state.rowWarnings);
  const rows = state.rows.map((row) => {
    const values = { ...row.values };
    const provenance: PreparedFieldSources = { ...rowProvenance.get(row.rowNumber) };

    if (hasNormalizedSaleNumber(values['saleNumber'])) {
      values['saleNumber'] = normalizeSaleNumberForImport(values['saleNumber']);
      provenance.saleNumber = 'imported';
    } else {
      values['saleNumber'] = null;
      provenance.saleNumber = 'defaulted';
      rowWarnings.set(row.rowNumber, {
        code: PREPARATION_INVOICE_WARNING.MISSING_INVOICE_NUMBER,
        message: MISSING_INVOICE_NUMBER_WARNING_MESSAGE,
      });
    }

    rowProvenance.set(row.rowNumber, provenance);

    return { ...row, values };
  });

  return {
    ...state,
    rows,
    rowProvenance,
    rowWarnings,
  };
}

function applyMoneySemanticsRule(state: SalesPreparationState): SalesPreparationState {
  const unitPriceMapped = mappingIncludesTargetField(state.mapping, 'sellingPrice');
  const lineTotalMapped = mappingIncludesTargetField(state.mapping, 'amount');

  if (!unitPriceMapped && !lineTotalMapped) {
    return state;
  }

  const rowProvenance = new Map(state.rowProvenance);
  const rowBlockingErrors = new Map(state.rowBlockingErrors);
  const rows = state.rows.map((row) => {
    const values = { ...row.values };
    const quantity = readQuantity(values['quantity']);
    const hasUnitPrice = hasMoneyValue(values['sellingPrice']);
    const hasLineTotal = hasMoneyValue(values['amount']);
    const provenance: PreparedFieldSources = { ...rowProvenance.get(row.rowNumber) };

    if (quantity === 0 && hasLineTotal && values['amount'] !== 0) {
      rowBlockingErrors.set(row.rowNumber, {
        code: PREPARATION_MONEY_ERROR.ZERO_QUANTITY_WITH_AMOUNT,
        message:
          'Line total cannot be applied when quantity is zero. Fix the quantity or amount in this row.',
      });

      return { ...row, values };
    }

    if (quantity !== null && quantity > 0) {
      if (unitPriceMapped && lineTotalMapped && hasUnitPrice && hasLineTotal) {
        const unitPrice = values['sellingPrice'] as number;
        const lineTotal = values['amount'] as number;

        if (!moneyValuesConsistent(quantity, unitPrice, lineTotal)) {
          rowBlockingErrors.set(row.rowNumber, {
            code: PREPARATION_MONEY_ERROR.INCONSISTENT_RATE_AMOUNT,
            message: `Rate and Amount do not match: ${quantity} × ₹${unitPrice} ≠ ₹${lineTotal}.`,
          });
        } else {
          provenance.sellingPrice = 'imported';
          provenance.amount = 'imported';
        }
      } else if (lineTotalMapped && hasLineTotal && (!unitPriceMapped || !hasUnitPrice)) {
        const lineTotal = values['amount'] as number;

        values['sellingPrice'] = deriveUnitPriceMajor(lineTotal, quantity);
        provenance.amount = 'imported';
        provenance.sellingPrice = 'derived';
      } else if (unitPriceMapped && hasUnitPrice && (!lineTotalMapped || !hasLineTotal)) {
        const unitPrice = values['sellingPrice'] as number;

        values['amount'] = calculateLineTotalMajor(quantity, unitPrice);
        provenance.sellingPrice = 'imported';
        provenance.amount = 'derived';
      } else if (unitPriceMapped && hasUnitPrice) {
        provenance.sellingPrice = 'imported';
      } else if (lineTotalMapped && hasLineTotal) {
        provenance.amount = 'imported';
      }
    } else {
      if (unitPriceMapped && hasUnitPrice) {
        provenance.sellingPrice = 'imported';
      }

      if (lineTotalMapped && hasLineTotal) {
        provenance.amount = 'imported';
      }
    }

    rowProvenance.set(row.rowNumber, provenance);

    return { ...row, values };
  });

  return {
    ...state,
    rows,
    rowProvenance,
    rowBlockingErrors,
  };
}
