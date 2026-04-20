export type AbsenceType = 'VACATION' | 'HOLIDAY' | 'SICK';
export type Role = 'ADMIN' | 'VIEWER';

export interface AbsenceRecord {
  id: string;
  employeeId: string;
  date: string; // ISO yyyy-mm-dd
  type: AbsenceType;
}

export interface Employee {
  id: string;
  name: string;
  department: string;     // department name (denormalised for the UI)
  departmentId: string;
  manager: string;
  startDate: string;      // ISO yyyy-mm-dd
}

export interface Department {
  id: string;
  name: string;
}

export interface AppConfig {
  vacationQuota: number;
  holidayQuota: number;
  carryoverDeadline: string; // MM-DD
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  prefs: Record<string, unknown>;
}

export interface BalanceBlock {
  quota: number;
  accruedYTD: number;
  accruedYear: number;
  used: number;
  carryIn: number;
  carryInExpiresAt: string | null;
  carryInForfeited: number;
  balanceToday: number;
  balanceEoy: number;
}

export interface BalanceResponse {
  asOf: string;
  workingYear: number;
  employmentStartDate: string;
  vacation: BalanceBlock;
  holiday: BalanceBlock;
  sick: { used: number };
}
