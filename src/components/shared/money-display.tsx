import { formatMoney } from '@/lib/utils/money';

type MoneyDisplayProps = {
  amount: number;
  className?: string;
};

export function MoneyDisplay({ amount, className }: MoneyDisplayProps) {
  return <span className={className}>{formatMoney(amount)}</span>;
}
