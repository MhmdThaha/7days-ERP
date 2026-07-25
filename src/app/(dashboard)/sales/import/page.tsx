import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { ImportWizard } from '@/components/import/import-wizard';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/sales" />}>
          <ArrowLeft />
          Back to Sales
        </Button>
      </div>
      <PageHeader
        title="Import Sales"
        description="Bring sales history in from Vyapar, myBillBook, Tally, or any Excel/CSV export."
      />
      <ImportWizard
        entityType="sale"
        entityLabel="Sales"
        entityLabelSingular="Sale"
        returnHref="/sales"
        returnLabel="Return to Sales"
      />
    </div>
  );
}
