export function calculateGrossProfit(netSales: number, totalCogs: number): number {
  return netSales - totalCogs;
}

export function calculateNetProfit(
  grossProfit: number,
  operatingExpenses: number,
  wastageLoss: number,
  returnsLoss = 0,
  otherIncome = 0,
): number {
  return grossProfit - operatingExpenses - wastageLoss - returnsLoss + otherIncome;
}
