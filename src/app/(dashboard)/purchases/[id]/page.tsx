import { PurchaseDetailPage } from '@/components/purchases/purchase-detail-page';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <PurchaseDetailPage purchaseId={id} />;
}
