export type TransactionType = 'income' | 'expense' | 'transfer';
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Transaction {
  id: number;
  amount: number;
  type: TransactionType;
  category_id: number | null;
  account_id: number;
  to_account_id: number | null;
  date: string; // ISO format YYYY-MM-DD HH:mm
  notes: string;
  entrusted_fund_id?: number | null; // links to an EntrustedFund (null/absent for normal transactions)
  created_at: string;
  // Joined fields
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  account_name?: string;
  to_account_name?: string;
  tags?: Tag[];
}

export interface EntrustedFund {
  id: number;
  name: string;
  target_amount: number; // 0 = no target
  notes: string;
  closed: boolean;
  created_at: string;
  members: string[]; // expected contributor names (roster), even before they contribute
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense' | 'both';
  active: boolean;
  sort_order?: number;
}

export interface Account {
  id: number;
  name: string;
  icon: string;
  color: string;
  initial_balance: number;
  active: boolean;
  sort_order?: number;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  active: boolean;
  category_id: number | null; // null = global tag, number = category-specific
  sort_order?: number;
}

export interface TransactionTag {
  transaction_id: number;
  tag_id: number;
}

export interface Budget {
  id: number;
  category_id: number | null; // null = overall budget
  amount: number;
  month: string; // YYYY-MM
  category_name?: string;
  category_color?: string;
  spent?: number;
  active?: boolean;
}

export interface RecurringTransaction {
  id: number;
  amount: number;
  type: TransactionType;
  category_id: number | null;
  account_id: number;
  notes: string;
  recurrence_type: RecurrenceType;
  next_date: string;
  active: boolean;
  auto_create: boolean;
  category_name?: string;
  account_name?: string;
}

export interface DailySummary {
  date: string;
  total_income: number;
  total_expense: number;
  total_transfer: number;
  count: number;
}

export interface CategorySummary {
  category_id: number;
  category_name: string;
  category_icon: string;
  category_color: string;
  total: number;
  count: number;
  percentage: number;
}

export interface MonthlySummary {
  month: string;
  total_income: number;
  total_expense: number;
  net: number;
}

export interface AccountBalance {
  account_id: number;
  account_name: string;
  account_color: string;
  balance: number;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface TransactionFilters {
  search?: string;
  dateRange?: DateRange;
  categoryId?: number;
  accountId?: number;
  type?: TransactionType;
  amountMin?: number;
  amountMax?: number;
  tagIds?: number[];
}
