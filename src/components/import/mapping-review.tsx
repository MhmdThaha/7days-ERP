'use client';

import {
  ArrowRight,
  Ban,
  Loader2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ImportGuidancePanel } from '@/components/import/import-guidance';
import type { ColumnDefinition } from '@/lib/import/engine/types';
import type { ImportGuidanceResult } from '@/lib/import/guidance/types';
import type { MappingReviewViewModel } from '@/lib/import/mapping-review/types';
import { cn } from '@/lib/utils';

export type MappingReviewProps = {
  viewModel: MappingReviewViewModel;
  columns: readonly ColumnDefinition[];
  guidance: ImportGuidanceResult;
  saveMappingEnabled: boolean;
  onSaveMappingEnabledChange: (enabled: boolean) => void;
  onChangeTarget: (sourceHeader: string, targetField: string) => void;
  onResolveAmbiguous: (sourceHeader: string, targetField: string) => void;
  onIgnore: (sourceHeader: string) => void;
  onRestoreAuto: (sourceHeader: string) => void;
  onResetAll: () => void;
  onContinue: () => void;
  onStartOver: () => void;
  isBusy?: boolean;
};

/**
 * Presentation-only Mapping Review screen.
 * All mapping decisions are produced by import services; this component
 * displays pipeline outputs and forwards edit intents to the parent.
 */
export function MappingReview({
  viewModel,
  columns,
  guidance,
  saveMappingEnabled,
  onSaveMappingEnabledChange,
  onChangeTarget,
  onResolveAmbiguous,
  onIgnore,
  onRestoreAuto,
  onResetAll,
  onContinue,
  onStartOver,
  isBusy = false,
}: MappingReviewProps) {
  const claimedFields = new Set(
    viewModel.rows
      .filter((row) => row.status === 'mapped' && row.targetField)
      .map((row) => row.targetField as string),
  );

  const hasBlockingAmbiguity = viewModel.ambiguousHeaders.length > 0;
  const hasMappedColumns = viewModel.mappedHeaders.length > 0;

  return (
    <div className="space-y-6">
      <ImportGuidancePanel guidance={guidance} />

      <Card>
        <CardHeader>
          <CardTitle>Column mapping</CardTitle>
          <CardDescription>
            Review how file columns map to BakeryOS fields. Adjust mappings before
            previewing your data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            <Metric label="Detected report" value={viewModel.reportDisplayName} />
            <Metric
              label="Report confidence"
              value={formatConfidence(viewModel.reportConfidence)}
            />
            <Metric
              label="Mapping confidence"
              value={formatConfidence(viewModel.mappingConfidence)}
            />
          </dl>

          {viewModel.canSaveMapping ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3">
              <Switch
                id="save-mapping"
                checked={saveMappingEnabled}
                onCheckedChange={onSaveMappingEnabledChange}
                disabled={isBusy}
              />
              <Label htmlFor="save-mapping" className="cursor-pointer text-sm font-normal">
                Save this mapping for future imports
              </Label>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Mapped columns</CardTitle>
            <CardDescription>
              {viewModel.mappedHeaders.length} mapped · {viewModel.unmappedHeaders.length}{' '}
              unmapped · {viewModel.ignoredHeaders.length} ignored
              {viewModel.ambiguousHeaders.length > 0
                ? ` · ${viewModel.ambiguousHeaders.length} ambiguous`
                : ''}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onResetAll} disabled={isBusy}>
            <RotateCcw />
            Reset all
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {viewModel.rows.map((row) => (
              <MappingReviewRow
                key={row.sourceHeader}
                row={row}
                columns={columns}
                claimedFields={claimedFields}
                disabled={isBusy}
                onChangeTarget={onChangeTarget}
                onResolveAmbiguous={onResolveAmbiguous}
                onIgnore={onIgnore}
                onRestoreAuto={onRestoreAuto}
              />
            ))}
          </ul>

          {viewModel.unmappedHeaders.length > 0 ? (
            <SummaryList title="Unmapped headers" items={viewModel.unmappedHeaders} />
          ) : null}

          {viewModel.ignoredHeaders.length > 0 ? (
            <SummaryList title="Ignored headers" items={viewModel.ignoredHeaders} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {hasBlockingAmbiguity
              ? 'Resolve ambiguous mappings before continuing.'
              : hasMappedColumns
                ? 'Continue to preview validated rows with this mapping.'
                : 'Map at least one column to continue.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onStartOver} disabled={isBusy}>
              Start over
            </Button>
            <Button
              onClick={onContinue}
              disabled={isBusy || !hasMappedColumns || hasBlockingAmbiguity}
            >
              {isBusy ? <Loader2 className="animate-spin" /> : null}
              Continue to preview
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type MappingReviewRowProps = {
  row: MappingReviewViewModel['rows'][number];
  columns: readonly ColumnDefinition[];
  claimedFields: Set<string>;
  disabled: boolean;
  onChangeTarget: (sourceHeader: string, targetField: string) => void;
  onResolveAmbiguous: (sourceHeader: string, targetField: string) => void;
  onIgnore: (sourceHeader: string) => void;
  onRestoreAuto: (sourceHeader: string) => void;
};

function MappingReviewRow({
  row,
  columns,
  claimedFields,
  disabled,
  onChangeTarget,
  onResolveAmbiguous,
  onIgnore,
  onRestoreAuto,
}: MappingReviewRowProps) {
  const selectOptions =
    row.status === 'ambiguous'
      ? row.ambiguousCandidates.map((candidate) => ({
          value: candidate.targetField,
          label: candidate.label,
        }))
      : columns
          .filter(
            (column) =>
              !claimedFields.has(column.field) || column.field === row.targetField,
          )
          .map((column) => ({ value: column.field, label: column.label }));

  const handleSelect = (value: string | null) => {
    if (!value) {
      return;
    }

    if (row.status === 'ambiguous') {
      onResolveAmbiguous(row.sourceHeader, value);
      return;
    }

    onChangeTarget(row.sourceHeader, value);
  };

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-lg border px-3 py-3 sm:flex-row sm:items-center',
        row.status === 'ambiguous' && 'border-amber-500/40 bg-amber-500/5',
        row.status === 'ignored' && 'opacity-70',
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium" title={row.sourceHeader}>
            {row.sourceHeader}
          </span>
          <StatusBadge status={row.status} mappingSource={row.mappingSource} />
        </div>
        {row.autoSuggestion ? (
          <p className="text-xs text-muted-foreground">
            Auto suggestion: {row.autoSuggestion.label}
          </p>
        ) : null}
      </div>

      <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />

      <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px]">
        {row.status === 'ignored' ? (
          <span className="text-sm text-muted-foreground">Ignored</span>
        ) : (
          <Select
            value={row.targetField ?? ''}
            onValueChange={handleSelect}
            disabled={disabled || selectOptions.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  row.status === 'ambiguous' ? 'Choose mapping…' : 'Select field…'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex flex-wrap gap-1">
          {row.status !== 'ignored' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onIgnore(row.sourceHeader)}
            >
              <Ban />
              Ignore
            </Button>
          ) : null}
          {row.autoSuggestion || row.status === 'ignored' || row.mappingSource === 'manual' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onRestoreAuto(row.sourceHeader)}
            >
              <Sparkles />
              Restore auto
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function StatusBadge({
  status,
  mappingSource,
}: {
  status: MappingReviewViewModel['rows'][number]['status'];
  mappingSource: MappingReviewViewModel['rows'][number]['mappingSource'];
}) {
  const label =
    status === 'mapped'
      ? mappingSource === 'saved'
        ? 'Saved'
        : mappingSource === 'auto'
          ? 'Auto'
          : 'Manual'
      : status;

  const variant =
    status === 'mapped'
      ? 'default'
      : status === 'ambiguous'
        ? 'warning'
        : status === 'ignored'
          ? 'neutral'
          : 'secondary';

  return (
    <Badge variant={variant as 'default'} className="capitalize">
      {label}
    </Badge>
  );
}

function SummaryList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="space-y-1.5 border-t pt-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="neutral">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}
