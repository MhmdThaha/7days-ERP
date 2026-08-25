export function resolveDraftIdForCompletion(
  pendingDraftId: string | null,
  newlyCreatedDraftId: string | null,
): string | null {
  return pendingDraftId ?? newlyCreatedDraftId;
}
