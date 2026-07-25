'use client';

import { Loader2 } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

type ImportLoadingStepProps = {
  fileName: string;
  /** Override the default analysis message. */
  title?: string;
  description?: string;
};

export function ImportLoadingStep({
  fileName,
  title = 'Checking your file…',
  description,
}: ImportLoadingStepProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <Loader2 className="size-10 animate-spin text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">
            {description ??
              `Reading ${fileName}, matching columns, and validating every row.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
