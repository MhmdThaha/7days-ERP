import { ReturnDetailPage } from '@/components/returns/return-detail-page';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;

  return <ReturnDetailPage returnId={id} />;
}
