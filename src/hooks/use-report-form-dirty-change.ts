import { useEffect } from 'react';
import { useFormState, type Control, type FieldValues } from 'react-hook-form';

/** Subscribes to react-hook-form dirty state and reports changes upward. */
export function useReportFormDirtyChange<TFieldValues extends FieldValues>(
  control: Control<TFieldValues>,
  onDirtyChange?: (isDirty: boolean) => void,
): void {
  const { isDirty } = useFormState({ control });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
}
