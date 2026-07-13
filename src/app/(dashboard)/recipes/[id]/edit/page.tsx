import { RecipeEditPage } from '@/components/recipes/recipe-edit-page';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <RecipeEditPage recipeId={id} />;
}
