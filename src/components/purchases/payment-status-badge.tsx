import { Badge } from '@/components/ui/badge';
import type { PaymentStatus } from '@/types/purchase';

type PaymentStatusBadgeProps = {
  paymentStatus: PaymentStatus;
};

export function PaymentStatusBadge({ paymentStatus }: PaymentStatusBadgeProps) {
  const isPaid = paymentStatus === 'paid';

  return <Badge variant={isPaid ? 'success' : 'warning'}>{isPaid ? 'Paid' : 'Credit'}</Badge>;
}
