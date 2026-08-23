'use client';

import { TriangleAlert } from 'lucide-react';

import type { DuplicateImportWarning } from '@/lib/import/duplicate/duplicate-import-review';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type SalesImportDuplicateStepProps = {
  warning: DuplicateImportWarning;
  onCancel: () => void;
  onImportAnyway: () => void;
  isBusy?: boolean;
};

export function SalesImportDuplicateStep({
  warning,
  onCancel,
  onImportAnyway,
  isBusy = false,
}: SalesImportDuplicateStepProps) {
  return (
    <div className="space-y-6">
      <Alert variant="warning">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{warning.title}</AlertTitle>
        <AlertDescription>{warning.message}</AlertDescription>
      </Alert>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">
            If these sales are new, you can import them. If you already imported this file, choose
            Cancel.
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onCancel} disabled={isBusy}>
              Cancel
            </Button>
            <Button onClick={onImportAnyway} disabled={isBusy}>
              Import anyway
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
