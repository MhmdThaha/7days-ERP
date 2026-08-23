/**
 * Shared in-memory Firestore collectionGroup mock for duplicate index tests (TEST ONLY).
 */

export type InMemoryDocMap = Map<string, Record<string, unknown>>;

export function createCollectionGroupQuery(
  docs: InMemoryDocMap,
  collectionName: string,
  options?: { throwOnIndexRead?: () => boolean },
) {
  const filters: Array<{ field: string; op: string; value: unknown }> = [];

  function matchingDocs() {
    return [...docs.entries()]
      .filter(([path, data]) => {
        const marker = `/${collectionName}/`;
        const markerIndex = path.indexOf(marker);

        if (markerIndex === -1) {
          return false;
        }

        const suffix = path.slice(markerIndex + marker.length);

        if (suffix.includes('/')) {
          return false;
        }

        for (const filter of filters) {
          if (filter.op === '==') {
            if (data[filter.field] !== filter.value) {
              return false;
            }
          } else if (filter.op === 'in') {
            const values = filter.value as unknown[];

            if (!values.includes(data[filter.field])) {
              return false;
            }
          }
        }

        return true;
      })
      .map(([path, data]) => ({
        id: path.slice(path.lastIndexOf('/') + 1),
        data: () => data,
      }));
  }

  const queryBuilder = {
    where(field: string, op: string, value: unknown) {
      filters.push({ field, op, value });
      return queryBuilder;
    },
    get: async () => {
      if (options?.throwOnIndexRead?.()) {
        throw new Error('Simulated index lookup failure');
      }

      const docsForQuery = matchingDocs();

      return {
        docs: docsForQuery,
        empty: docsForQuery.length === 0,
      };
    },
  };

  return queryBuilder;
}

export function withCollectionGroupMock<T extends Record<string, unknown>>(
  db: T,
  docs: InMemoryDocMap,
  options?: { throwOnIndexRead?: () => boolean },
): T & { collectionGroup: (name: string) => ReturnType<typeof createCollectionGroupQuery> } {
  return {
    ...db,
    collectionGroup: (name: string) => createCollectionGroupQuery(docs, name, options),
  };
}
