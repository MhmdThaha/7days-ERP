import { ExpenseDetailPage } from '@/components/expenses/expense-detail-page';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;

  return <ExpenseDetailPage expenseId={id} />;
}
