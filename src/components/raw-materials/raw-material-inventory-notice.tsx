import { Info } from 'lucide-react';

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

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
            <strong>Current Stock</strong> increases when you record purchases and decreases when
            ingredients are used in production. <strong>Average Cost</strong> is calculated from
            your purchase history. These values appear in the table below and update automatically
            — you only manage the material details here.
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
