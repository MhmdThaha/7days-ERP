import { PurchaseEditPage } from '@/components/purchases/purchase-edit-page';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <PurchaseEditPage purchaseId={id} />;
}
