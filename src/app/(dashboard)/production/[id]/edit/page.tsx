import { ProductionEditPage } from '@/components/production/production-edit-page';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;

  return <ProductionEditPage productionId={id} />;
}
