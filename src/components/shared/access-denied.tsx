import { ShieldX } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type AccessDeniedProps = {
  title?: string;
  description?: string;
};

export function AccessDenied({
  title = 'Access denied',
  description = 'You do not have permission to view this page.',
}: AccessDeniedProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      <Alert variant="destructive">
        <ShieldX className="size-4" aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
    </div>
  );
}
