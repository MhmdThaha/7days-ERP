import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PaymentStatus } from '@/types/purchase';

type PaymentStatusBadgeProps = {
  paymentStatus: PaymentStatus;
};

export function PaymentStatusBadge({ paymentStatus }: PaymentStatusBadgeProps) {
  const isPaid = paymentStatus === 'paid';

  return (
    <Badge
      variant={isPaid ? 'default' : 'outline'}
      className={cn(
        isPaid && 'bg-emerald-600 text-white hover:bg-emerald-600/90',
        !isPaid && 'border-amber-200 bg-amber-50 text-amber-800',
      )}
    >
      {isPaid ? 'Paid' : 'Credit'}
    </Badge>
  );
}
