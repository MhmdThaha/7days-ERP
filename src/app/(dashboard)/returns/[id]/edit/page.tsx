import { ReturnEditPage } from '@/components/returns/return-edit-page';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;

  return <ReturnEditPage returnId={id} />;
}
