// income => positif ; expense / transfer / savings => négatif.
export function signedAmount(absAmount: number, categoryType: string): number {
  return categoryType === "income" ? Math.abs(absAmount) : -Math.abs(absAmount);
}
