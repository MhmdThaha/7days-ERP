import { Info } from 'lucide-react';

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AVERAGE_COST_HELP_TEXT } from '@/lib/domain/constants/inventory';

type RawMaterialInventoryNoticeProps = {
  compact?: boolean;
  onDismiss?: () => void;
};

export function RawMaterialInventoryNotice({
  compact = false,
  onDismiss,
}: RawMaterialInventoryNoticeProps) {
  return (
    <Alert className="border-muted-foreground/15 bg-muted/30">
      <Info aria-hidden="true" />
      <AlertTitle>Stock and average cost are managed for you</AlertTitle>
      <AlertDescription>
        {compact ? (
          <p>
            Current Stock and Average Cost update when you record Purchases and Production. You
            cannot edit them here.
          </p>
        ) : (
          <p>
            <strong>Current Stock</strong> increases when you receive purchases and decreases when
            ingredients are used in production. {AVERAGE_COST_HELP_TEXT} These values appear in the
            table below and update automatically — you only manage the material details here.
          </p>
        )}
      </AlertDescription>
      {onDismiss ? (
        <AlertAction>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
