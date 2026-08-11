'use client';

import { FileUp, Inbox, PartyPopper, SearchX } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

export function ImportReviewNoFileState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <FileUp className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">No file uploaded</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Upload a spreadsheet to see the import review.
        </p>
      </CardContent>
    </Card>
  );
}

export function ImportReviewNoRowsState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Inbox className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">No rows</p>
        <p className="max-w-md text-sm text-muted-foreground">
          The uploaded file did not contain any data rows to review.
        </p>
      </CardContent>
    </Card>
  );
}

export function ImportReviewNoErrorsState() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-sm text-success-foreground">
      <PartyPopper className="size-4 shrink-0" aria-hidden="true" />
      <span>No error rows — all rows are ready or need only warnings review.</span>
    </div>
  );
}

export function ImportReviewNoWarningsState() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-sm text-success-foreground">
      <PartyPopper className="size-4 shrink-0" aria-hidden="true" />
      <span>No warning rows.</span>
    </div>
  );
}

export function ImportReviewNoFilterMatchesState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No rows match the current filter or search.</p>
      </CardContent>
    </Card>
  );
}
