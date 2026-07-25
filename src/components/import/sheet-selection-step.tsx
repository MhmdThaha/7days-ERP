'use client';

import { ArrowLeft, ArrowRight, Table2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type SheetSelectionStepProps = {
  sheetNames: readonly string[];
  selectedSheet: string | null;
  onSelect: (sheetName: string) => void;
  onBack: () => void;
  onContinue: () => void;
  isBusy: boolean;
};

export function SheetSelectionStep({
  sheetNames,
  selectedSheet,
  onSelect,
  onBack,
  onContinue,
  isBusy,
}: SheetSelectionStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a worksheet</CardTitle>
        <CardDescription>
          This file has {sheetNames.length} worksheets. Pick the one with your data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2" role="radiogroup" aria-label="Worksheets">
          {sheetNames.map((sheetName) => {
            const isSelected = sheetName === selectedSheet;

            return (
              <button
                key={sheetName}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:bg-muted/50',
                )}
                onClick={() => onSelect(sheetName)}
                disabled={isBusy}
              >
                <Table2 className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate font-medium">{sheetName}</span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} disabled={isBusy}>
            <ArrowLeft />
            Back
          </Button>
          <Button onClick={onContinue} disabled={!selectedSheet || isBusy}>
            Continue
            <ArrowRight />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
