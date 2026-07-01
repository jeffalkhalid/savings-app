export type TxnType = "expense" | "income" | "transfer" | "savings";

export type Txn = {
  id: string;
  date: string;
  amount: number;
  description: string;
  type: TxnType;
  category_id?: string | null;
  account_id?: string | null;
  goal_id?: string | null;
};

export type Category = {
  id: string;
  name: string;
  type: string;
  color: string;
  is_fixed?: boolean;
  active?: boolean;
  user_id?: string | null;
};
export type Account = { id: string; name: string };
