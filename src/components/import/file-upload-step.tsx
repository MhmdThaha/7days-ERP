'use client';

import { useRef, useState } from 'react';
import { ArrowRight, FileSpreadsheet, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  IMPORT_FILE_ACCEPT,
  MAX_IMPORT_FILE_BYTES,
  isSupportedImportFileName,
} from '@/lib/import/constants';
import { cn } from '@/lib/utils';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FileUploadStepProps = {
  file: File | null;
  onFileSelected: (file: File | null) => void;
  onContinue: () => void;
  isBusy: boolean;
};

export function FileUploadStep({
  file,
  onFileSelected,
  onContinue,
  isBusy,
}: FileUploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function acceptFile(candidate: File) {
    if (!isSupportedImportFileName(candidate.name)) {
      setError('Unsupported file type. Upload a .csv, .xlsx, or .xls file.');
      return;
    }

    if (candidate.size > MAX_IMPORT_FILE_BYTES) {
      setError(
        `The file is too large. The limit is ${Math.floor(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB.`,
      );
      return;
    }

    setError(null);
    onFileSelected(candidate);
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        {file ? (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
            <FileSpreadsheet className="size-8 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                onFileSelected(null);
                setError(null);

                if (inputRef.current) {
                  inputRef.current.value = '';
                }
              }}
              disabled={isBusy}
              aria-label="Remove selected file"
            >
              <X />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className={cn(
              'flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50',
            )}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragOver(false);

              const dropped = event.dataTransfer.files[0];

              if (dropped) {
                acceptFile(dropped);
              }
            }}
          >
            <Upload className="size-10 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">Drag & drop your file here, or click to browse</p>
              <p className="text-sm text-muted-foreground">
                Excel (.xlsx, .xls) or CSV — up to{' '}
                {Math.floor(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB
              </p>
            </div>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={IMPORT_FILE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0];

            if (selected) {
              acceptFile(selected);
            }
          }}
        />

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end">
          <Button onClick={onContinue} disabled={!file || isBusy}>
            Continue
            <ArrowRight />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
