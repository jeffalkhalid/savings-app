import type { Txn, TxnType } from "./types";

export type Metrics = {
  revenus: number;
  depenses: number;
  epargne: number;
  transferts: number;
  tauxEpargne: number;
  resteAVivre: number;
};

const sumAbs = (txns: Txn[], type: TxnType) =>
  txns
    .filter((x) => x.type === type)
    .reduce((acc, x) => acc + Math.abs(Number(x.amount)), 0);

export function computeMetrics(txns: Txn[]): Metrics {
  const revenus = sumAbs(txns, "income");
  const depenses = sumAbs(txns, "expense");
  const epargne = sumAbs(txns, "savings");
  const transferts = sumAbs(txns, "transfer");
  // Ce qui reste vraiment sur le compte : net signé de TOUS les flux
  // (revenus + virements reçus − dépenses − épargne − virements émis).
  const resteAVivre = txns.reduce((acc, x) => acc + Number(x.amount), 0);
  return {
    revenus,
    depenses,
    epargne,
    transferts,
    tauxEpargne: revenus > 0 ? epargne / revenus : 0,
    resteAVivre,
  };
}
