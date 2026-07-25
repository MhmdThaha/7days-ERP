'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  analyzeImportAction,
  commitImportWithResolutionAction,
  detectImportConflictsAction,
  getImportSheetsAction,
  revalidateImportMappingAction,
  type CommitImportOutcome,
} from '@/actions/import';
import { ConflictReview } from '@/components/import/conflict-review';
import { FileUploadStep } from '@/components/import/file-upload-step';
import { ImportLoadingStep } from '@/components/import/import-loading-step';
import { ImportPreview } from '@/components/import/import-preview';
import { ImportResult } from '@/components/import/import-result';
import { MappingReview } from '@/components/import/mapping-review';
import { SheetSelectionStep } from '@/components/import/sheet-selection-step';
import { getImportDefinition, type ImportEntityType } from '@/lib/import/definitions';
import { getImportUiCopy } from '@/lib/import/import-ui-copy';
import type { MappingReviewBaseline, MappingReviewBundle, MappingReviewEditState } from '@/lib/import/mapping-review/types';
import type { ImportResolutionStrategy } from '@/lib/import/services/conflict-resolution.service';
import type { ImportConflictDetectionOutcome } from '@/lib/import/services/import-entity-outcomes';
import {
  changeMappedTargetField,
  createEditStateFromRows,
  ignoreSourceHeader,
  mappingReviewStateToConfig,
  rebuildViewModel,
  resetAllMappingReview,
  resolveAmbiguousMapping,
  restoreAutoSuggestion,
} from '@/lib/import/services/mapping-review.service';
import {
  applySaveMappingToggleGuidance,
} from '@/lib/import/services/import-guidance.service';
import { cn } from '@/lib/utils';
import type { ImportAnalysis, ImportAutoMappingSnapshot } from '@/types/import';

/** React Query keys that go stale after a successful import of this entity. */
const QUERY_KEYS_BY_ENTITY: Partial<Record<ImportEntityType, readonly string[]>> = {
  product: ['products'],
  sale: ['sales', 'products'],
};

type WizardStep =
  | 'upload'
  | 'sheets'
  | 'running'
  | 'mapping'
  | 'revalidating'
  | 'preview'
  | 'checking-conflicts'
  | 'conflicts'
  | 'committing'
  | 'result';

const STEP_LABELS: { key: WizardStep; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'sheets', label: 'Worksheet' },
  { key: 'mapping', label: 'Mapping' },
  { key: 'preview', label: 'Review' },
  { key: 'conflicts', label: 'Conflicts' },
  { key: 'result', label: 'Done' },
];

type ImportWizardProps = {
  entityType: ImportEntityType;
  entityLabel: string;
  entityLabelSingular?: string;
  returnHref: string;
  returnLabel: string;
};

export function ImportWizard({
  entityType,
  entityLabel,
  entityLabelSingular,
  returnHref,
  returnLabel,
}: ImportWizardProps) {
  const queryClient = useQueryClient();
  const definition = useMemo(() => getImportDefinition(entityType), [entityType]);
  const columns = definition?.columns ?? [];

  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<readonly string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [mappingBaseline, setMappingBaseline] = useState<MappingReviewBaseline | null>(null);
  const [mappingBundle, setMappingBundle] = useState<MappingReviewBundle | null>(null);
  const [mappingEditState, setMappingEditState] = useState<MappingReviewEditState | null>(null);
  const [autoMappingSnapshot, setAutoMappingSnapshot] =
    useState<ImportAutoMappingSnapshot | null>(null);
  const [saveMappingEnabled, setSaveMappingEnabled] = useState(false);
  const [conflicts, setConflicts] = useState<ImportConflictDetectionOutcome | null>(null);
  const [commitOutcome, setCommitOutcome] = useState<CommitImportOutcome | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const mappingViewModel = useMemo(() => {
    if (!mappingEditState || !mappingBundle) {
      return mappingBundle?.viewModel ?? null;
    }

    return rebuildViewModel(mappingEditState, mappingBundle.viewModel, columns);
  }, [mappingEditState, mappingBundle, columns]);

  const mappingGuidance = useMemo(() => {
    if (!analysis?.guidance || !mappingBundle) {
      return analysis?.guidance ?? { items: [] };
    }

    return applySaveMappingToggleGuidance(
      analysis.guidance,
      saveMappingEnabled,
      mappingBundle.reportType,
    );
  }, [analysis?.guidance, saveMappingEnabled, mappingBundle]);

  function reset() {
    setStep('upload');
    setFile(null);
    setSheetNames([]);
    setSelectedSheet(null);
    setAnalysis(null);
    setMappingBaseline(null);
    setMappingBundle(null);
    setMappingEditState(null);
    setAutoMappingSnapshot(null);
    setSaveMappingEnabled(false);
    setConflicts(null);
    setCommitOutcome(null);
  }

  function toFormData(selected: File): FormData {
    const formData = new FormData();
    formData.append('file', selected);

    return formData;
  }

  function initializeMappingState(result: ImportAnalysis) {
    setAnalysis(result);
    setMappingBaseline(result.mappingReview.baseline);
    setMappingBundle(result.mappingReview);
    setMappingEditState(createEditStateFromRows(result.mappingReview.viewModel.rows));
    setAutoMappingSnapshot(result.autoMappingSnapshot);
    setSaveMappingEnabled(false);
  }

  function applyMappingEdit(
    updater: (
      state: MappingReviewEditState,
      bundle: MappingReviewBundle,
    ) => { state: MappingReviewEditState; mapping: ImportAnalysis['mapping'] },
  ) {
    if (!mappingEditState || !mappingBundle) {
      return;
    }

    const result = updater(mappingEditState, mappingBundle);
    setMappingEditState(result.state);

    if (analysis) {
      setAnalysis({
        ...analysis,
        mapping: result.mapping,
        unmappedHeaders: rebuildViewModel(result.state, mappingBundle.viewModel, columns)
          .unmappedHeaders,
      });
    }
  }

  async function handleUploadContinue() {
    if (!file || isBusy) {
      return;
    }

    setIsBusy(true);

    try {
      const result = await getImportSheetsAction(toFormData(file));

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const names = result.data.sheetNames;
      setSheetNames(names);

      if (names.length === 1) {
        await runAnalysis(file, names[0]);
        return;
      }

      setSelectedSheet(names[0] ?? null);
      setStep('sheets');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSheetContinue() {
    if (!file || !selectedSheet || isBusy) {
      return;
    }

    setIsBusy(true);

    try {
      await runAnalysis(file, selectedSheet);
    } finally {
      setIsBusy(false);
    }
  }

  async function runAnalysis(selected: File, sheetName: string | undefined) {
    setStep('running');

    const result = await analyzeImportAction(entityType, toFormData(selected), sheetName);

    if (!result.success) {
      toast.error(result.error);
      setStep(sheetNames.length > 1 ? 'sheets' : 'upload');
      return;
    }

    initializeMappingState(result.data);
    setStep('mapping');
  }

  async function handleMappingContinue() {
    if (!file || !mappingEditState || !mappingBundle || isBusy) {
      return;
    }

    const mapping = mappingReviewStateToConfig(mappingEditState);
    setStep('revalidating');
    setIsBusy(true);

    try {
      const result = await revalidateImportMappingAction(
        entityType,
        toFormData(file),
        mapping,
        selectedSheet ?? undefined,
      );

      if (!result.success) {
        toast.error(result.error);
        setStep('mapping');
        return;
      }

      setAnalysis(result.data);
      setMappingBundle(result.data.mappingReview);
      setStep('preview');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImport() {
    if (!analysis || isCheckingConflicts) {
      return;
    }

    setIsCheckingConflicts(true);
    setStep('checking-conflicts');

    try {
      const result = await detectImportConflictsAction(analysis.report);

      if (!result.success) {
        toast.error(result.error);
        setStep('preview');
        return;
      }

      setConflicts(result.data);
      setStep('conflicts');
    } finally {
      setIsCheckingConflicts(false);
    }
  }

  async function handleCommit(strategy: ImportResolutionStrategy) {
    if (!analysis || !conflicts || isCommitting) {
      return;
    }

    setIsCommitting(true);
    setStep('committing');

    try {
      const result = await commitImportWithResolutionAction(
        analysis.report,
        conflicts,
        strategy,
        {
          saveMapping: saveMappingEnabled,
          mapping: analysis.mapping,
          reportType: analysis.mappingReview.reportType,
        },
      );

      if (!result.success) {
        toast.error(result.error);
        setStep('conflicts');
        return;
      }

      const staleKeys = QUERY_KEYS_BY_ENTITY[entityType] ?? [];
      await Promise.all(
        staleKeys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );

      setCommitOutcome(result.data);
      setStep('result');
    } finally {
      setIsCommitting(false);
    }
  }

  const uiCopy = getImportUiCopy(entityType);

  const activeLabelKey: WizardStep =
    step === 'running' || step === 'revalidating' || step === 'checking-conflicts'
      ? step === 'running'
        ? 'mapping'
        : 'preview'
      : step === 'committing'
        ? 'conflicts'
        : step;
  const visibleSteps = STEP_LABELS.filter(
    (entry) => entry.key !== 'sheets' || sheetNames.length > 1,
  );

  return (
    <div
      className={cn(
        'mx-auto w-full space-y-6',
        step === 'mapping' || step === 'preview' || step === 'conflicts'
          ? 'max-w-none'
          : step === 'result'
            ? 'max-w-3xl'
            : 'max-w-2xl',
      )}
    >
      <ol className="flex items-center gap-2">
        {visibleSteps.map((entry, index) => {
          const activeIndex = visibleSteps.findIndex((e) => e.key === activeLabelKey);
          const state =
            index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'todo';

          return (
            <li key={entry.key} className="flex items-center gap-2">
              {index > 0 ? <span className="h-px w-8 bg-border" aria-hidden="true" /> : null}
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs font-medium',
                  state === 'done' && 'bg-primary text-primary-foreground',
                  state === 'active' && 'bg-primary text-primary-foreground',
                  state === 'todo' && 'bg-muted text-muted-foreground',
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  'text-sm',
                  state === 'active' ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                {entry.label}
              </span>
            </li>
          );
        })}
      </ol>

      {step === 'upload' ? (
        <FileUploadStep
          file={file}
          onFileSelected={setFile}
          onContinue={handleUploadContinue}
          isBusy={isBusy}
        />
      ) : null}

      {step === 'sheets' ? (
        <SheetSelectionStep
          sheetNames={sheetNames}
          selectedSheet={selectedSheet}
          onSelect={setSelectedSheet}
          onBack={() => setStep('upload')}
          onContinue={handleSheetContinue}
          isBusy={isBusy}
        />
      ) : null}

      {(step === 'running' ||
        step === 'revalidating' ||
        step === 'checking-conflicts' ||
        step === 'committing') &&
      file ? (
        <ImportLoadingStep
          fileName={file.name}
          title={
            step === 'checking-conflicts'
              ? 'Checking for conflicts…'
              : step === 'committing'
                ? uiCopy.committingTitle
                : step === 'revalidating'
                  ? 'Applying your mapping…'
                  : 'Checking your file…'
          }
          description={
            step === 'checking-conflicts'
              ? uiCopy.checkingConflictsDescription(file.name)
              : step === 'committing'
                ? uiCopy.committingDescription
                : undefined
          }
        />
      ) : null}

      {step === 'mapping' && mappingViewModel && mappingEditState && mappingBundle ? (
        <MappingReview
          viewModel={mappingViewModel}
          columns={columns}
          guidance={mappingGuidance}
          saveMappingEnabled={saveMappingEnabled}
          onSaveMappingEnabledChange={setSaveMappingEnabled}
          onChangeTarget={(sourceHeader, targetField) => {
            applyMappingEdit((state, bundle) => {
              const result = changeMappedTargetField(
                state,
                bundle,
                columns,
                sourceHeader,
                targetField,
              );
              return { state: result.state, mapping: result.mapping };
            });
          }}
          onResolveAmbiguous={(sourceHeader, targetField) => {
            applyMappingEdit((state, bundle) => {
              const result = resolveAmbiguousMapping(
                state,
                bundle,
                columns,
                sourceHeader,
                targetField,
              );
              return { state: result.state, mapping: result.mapping };
            });
          }}
          onIgnore={(sourceHeader) => {
            applyMappingEdit((state, bundle) => {
              const result = ignoreSourceHeader(state, bundle, columns, sourceHeader);
              return { state: result.state, mapping: result.mapping };
            });
          }}
          onRestoreAuto={(sourceHeader) => {
            if (!autoMappingSnapshot) {
              return;
            }

            applyMappingEdit((state, bundle) => {
              const result = restoreAutoSuggestion(
                state,
                bundle,
                columns,
                sourceHeader,
                autoMappingSnapshot,
              );
              return { state: result.state, mapping: result.mapping };
            });
          }}
          onResetAll={() => {
            if (!mappingBaseline || !mappingBundle) {
              return;
            }

            const result = resetAllMappingReview(mappingBaseline, mappingBundle, columns);
            setMappingEditState(result.state);

            if (analysis) {
              setAnalysis({
                ...analysis,
                mapping: result.mapping,
                unmappedHeaders: result.viewModel.unmappedHeaders,
              });
            }
          }}
          onContinue={handleMappingContinue}
          onStartOver={reset}
          isBusy={isBusy}
        />
      ) : null}

      {step === 'preview' && analysis ? (
        <ImportPreview
          analysis={analysis}
          entityType={entityType}
          entityLabel={entityLabel}
          entityLabelSingular={entityLabelSingular}
          onStartOver={reset}
          onImport={handleImport}
          isImporting={isCheckingConflicts}
        />
      ) : null}

      {step === 'conflicts' && conflicts ? (
        <ConflictReview
          entityType={entityType}
          conflicts={conflicts}
          entityLabel={entityLabel}
          onCancel={() => setStep('preview')}
          onImportNewOnly={() => handleCommit('new-only')}
          onUpdateExisting={() => handleCommit('update-existing')}
          isCommitting={isCommitting}
        />
      ) : null}

      {step === 'result' && commitOutcome && analysis ? (
        <ImportResult
          entityType={entityType}
          outcome={commitOutcome}
          fileName={analysis.fileName}
          warningRows={analysis.report.result.summary.warningRows}
          entityLabel={entityLabel}
          returnHref={returnHref}
          returnLabel={returnLabel}
          onImportAnother={reset}
        />
      ) : null}
    </div>
  );
}
