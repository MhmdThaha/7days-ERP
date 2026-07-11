export function orgPath(orgId: string): string {
  return `organizations/${orgId}`;
}

export function productsPath(orgId: string): string {
  return `${orgPath(orgId)}/products`;
}

export function productPath(orgId: string, productId: string): string {
  return `${productsPath(orgId)}/${productId}`;
}
