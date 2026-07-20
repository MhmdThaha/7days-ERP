import { WastageEditPage } from '@/components/wastage/wastage-edit-page';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;

  return <WastageEditPage wastageId={id} />;
}
