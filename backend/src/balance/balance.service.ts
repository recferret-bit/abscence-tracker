import { Injectable, NotFoundException } from '@nestjs/common';
import { Absence, AbsenceType, AppSettings, Employee } from '../prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const round1 = (n: number): number => Math.round(n * 10) / 10;

const isWeekend = (d: Date): boolean => {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
};

const sameOrBefore = (a: Date, b: Date): boolean => a.getTime() <= b.getTime();

const utcDate = (year: number, monthIdx: number, day: number): Date =>
  new Date(Date.UTC(year, monthIdx, day));

const startOfYear = (year: number): Date => utcDate(year, 0, 1);
const endOfYear = (year: number): Date => utcDate(year, 11, 31);
const startOfMonth = (year: number, monthIdx: number): Date =>
  utcDate(year, monthIdx, 1);

/**
 * Number of full calendar months the employee was already employed for, between
 * Jan 1 of `year` and `upTo` (inclusive). A month counts if startDate <= first
 * day of that month AND we have not passed `upTo` before that first day.
 *
 * Examples:
 *   startDate = 2025-07-15, year = 2025, upTo = 2025-12-31  → months [Aug..Dec] = 5
 *   startDate = 2025-07-01, year = 2025, upTo = 2025-12-31  → months [Jul..Dec] = 6
 *   startDate = 2025-07-15, year = 2026, upTo = 2026-04-20  → months [Jan..Apr] = 4
 */
export function monthsWorkedInYear(
  startDate: Date,
  year: number,
  upTo: Date,
): number {
  let count = 0;
  for (let m = 0; m < 12; m++) {
    const monthStart = startOfMonth(year, m);
    if (monthStart.getTime() > upTo.getTime()) break;
    if (sameOrBefore(startDate, monthStart)) count += 1;
  }
  return count;
}

/**
 * Counts working-day absences of the given type in a year, optionally bounded
 * by an inclusive upper date.
 */
function workingDayAbsences(
  absences: Absence[],
  year: number,
  type: AbsenceType,
  upTo?: Date,
): number {
  return absences.filter((a) => {
    if (a.type !== type) return false;
    if (a.date.getUTCFullYear() !== year) return false;
    if (upTo && a.date.getTime() > upTo.getTime()) return false;
    if (isWeekend(a.date)) return false;
    return true;
  }).length;
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

interface ComputeArgs {
  startDate: Date;
  asOf: Date;
  absences: Absence[];
  vacationQuota: number;
  holidayQuota: number;
  carryoverDeadline: string; // MM-DD
}

/**
 * Pure computation of an employee's balance. Exposed for unit testing.
 */
export function computeBalance(args: ComputeArgs): Omit<BalanceResponse, 'employmentStartDate'> {
  const { startDate, asOf, absences, vacationQuota, holidayQuota, carryoverDeadline } = args;
  const startYear = startDate.getUTCFullYear();
  const currentYear = asOf.getUTCFullYear();

  // 1. Walk previous years to compute the vacation carry-in into currentYear.
  let vacCarry = 0;
  for (let y = startYear; y < currentYear; y++) {
    const accruedY =
      monthsWorkedInYear(startDate, y, endOfYear(y)) * (vacationQuota / 12);
    const usedY = workingDayAbsences(absences, y, AbsenceType.VACATION);
    vacCarry = Math.max(0, accruedY - usedY);
  }

  // 2. Carry deadline & forfeit logic for currentYear.
  const [mmStr, ddStr] = carryoverDeadline.split('-');
  const deadline = utcDate(currentYear, parseInt(mmStr, 10) - 1, parseInt(ddStr, 10));
  const pastDeadline = asOf.getTime() > deadline.getTime();

  const usedVacBeforeDeadline = workingDayAbsences(
    absences,
    currentYear,
    AbsenceType.VACATION,
    asOf.getTime() < deadline.getTime() ? asOf : deadline,
  );

  const effectiveVacCarry = pastDeadline
    ? Math.min(vacCarry, usedVacBeforeDeadline)
    : vacCarry;
  const vacForfeited = pastDeadline
    ? Math.max(0, vacCarry - usedVacBeforeDeadline)
    : 0;

  // 3. Current year accruals & usage.
  const vacAccruedYTD =
    monthsWorkedInYear(startDate, currentYear, asOf) * (vacationQuota / 12);
  const vacAccruedYear =
    monthsWorkedInYear(startDate, currentYear, endOfYear(currentYear)) *
    (vacationQuota / 12);
  const vacUsed = workingDayAbsences(absences, currentYear, AbsenceType.VACATION, asOf);

  const holAccruedYTD =
    monthsWorkedInYear(startDate, currentYear, asOf) * (holidayQuota / 12);
  const holAccruedYear =
    monthsWorkedInYear(startDate, currentYear, endOfYear(currentYear)) *
    (holidayQuota / 12);
  const holUsed = workingDayAbsences(absences, currentYear, AbsenceType.HOLIDAY, asOf);

  const sickUsed = workingDayAbsences(absences, currentYear, AbsenceType.SICK, asOf);

  return {
    asOf: asOf.toISOString().slice(0, 10),
    workingYear: currentYear,
    vacation: {
      quota: vacationQuota,
      accruedYTD: round1(vacAccruedYTD),
      accruedYear: round1(vacAccruedYear),
      used: vacUsed,
      carryIn: round1(effectiveVacCarry),
      carryInExpiresAt: deadline.toISOString().slice(0, 10),
      carryInForfeited: round1(vacForfeited),
      balanceToday: round1(vacAccruedYTD + effectiveVacCarry - vacUsed),
      balanceEoy: round1(vacAccruedYear + effectiveVacCarry - vacUsed),
    },
    holiday: {
      quota: holidayQuota,
      accruedYTD: round1(holAccruedYTD),
      accruedYear: round1(holAccruedYear),
      used: holUsed,
      // TZ REQ-04: holidays burn at year end → carry always 0
      carryIn: 0,
      carryInExpiresAt: null,
      carryInForfeited: 0,
      balanceToday: round1(holAccruedYTD - holUsed),
      balanceEoy: round1(holAccruedYear - holUsed),
    },
    sick: { used: sickUsed },
  };
}

@Injectable()
export class BalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getForEmployee(employeeId: string, asOfStr?: string): Promise<BalanceResponse> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const settings = (await this.prisma.appSettings.findUnique({ where: { id: 1 } })) ??
      (await this.prisma.appSettings.create({ data: { id: 1 } }));

    const absences = await this.prisma.absence.findMany({
      where: { employeeId },
      orderBy: { date: 'asc' },
    });

    const asOf = asOfStr
      ? new Date(asOfStr + (asOfStr.includes('T') ? '' : 'T00:00:00.000Z'))
      : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

    const result = computeBalance({
      startDate: employee.startDate,
      asOf,
      absences,
      vacationQuota: employee.vacationQuota ?? settings.vacationQuota,
      holidayQuota: employee.holidayQuota ?? settings.holidayQuota,
      carryoverDeadline: settings.carryoverDeadline,
    });

    return {
      ...result,
      vacation: {
        ...result.vacation,
        balanceToday: round1(result.vacation.balanceToday + employee.vacationAdjustment),
        balanceEoy: round1(result.vacation.balanceEoy + employee.vacationAdjustment),
      },
      holiday: {
        ...result.holiday,
        balanceToday: round1(result.holiday.balanceToday + employee.holidayAdjustment),
        balanceEoy: round1(result.holiday.balanceEoy + employee.holidayAdjustment),
      },
      employmentStartDate: employee.startDate.toISOString().slice(0, 10),
    };
  }
}

// Helpers re-exported only for tests
export const __testing = {
  computeBalance,
  monthsWorkedInYear,
};

// Avoid unused-warning for Employee/AppSettings import
export type _BalanceImports = Employee | AppSettings;
