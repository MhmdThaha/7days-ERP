import { SaleDetailPage } from '@/components/sales/sale-detail-page';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;

  return <SaleDetailPage saleId={id} />;
}
