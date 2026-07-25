import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { ImportWizard } from '@/components/import/import-wizard';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/products" />}>
          <ArrowLeft />
          Back to Products
        </Button>
      </div>
      <PageHeader
        title="Import Products"
        description="Bring your products in from Vyapar, myBillBook, Busy, or any Excel/CSV file."
      />
      <ImportWizard
        entityType="product"
        entityLabel="Products"
        entityLabelSingular="Product"
        returnHref="/products"
        returnLabel="Return to Products"
      />
    </div>
  );
}
