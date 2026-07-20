import { ExpenseEditPage } from '@/components/expenses/expense-edit-page';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;

  return <ExpenseEditPage expenseId={id} />;
}
