/**
 * Faithful port of backend/src/balance/balance.service.ts pure balance math (UTC, same rounding).
 */

import type { AbsenceType } from '../types';

const round1 = (n: number): number => Math.round(n * 10) / 10;

const isWeekend = (d: Date): boolean => {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
};

const sameOrBefore = (a: Date, b: Date): boolean => a.getTime() <= b.getTime();

const utcDate = (year: number, monthIdx: number, day: number): Date =>
  new Date(Date.UTC(year, monthIdx, day));

const endOfYear = (year: number): Date => utcDate(year, 11, 31);
const startOfMonth = (year: number, monthIdx: number): Date =>
  utcDate(year, monthIdx, 1);

const carryoverDeadlineDate = (year: number, carryoverDeadline: string): Date => {
  const [mmStr, ddStr] = carryoverDeadline.split('-');
  return utcDate(
    year,
    Number.parseInt(mmStr, 10) - 1,
    Number.parseInt(ddStr, 10),
  );
};

export interface AbsenceLike {
  date: Date;
  type: AbsenceType;
}

/**
 * Number of full calendar months the employee was already employed for, between
 * Jan 1 of `year` and `upTo` (inclusive).
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

function workingDayAbsences(
  absences: AbsenceLike[],
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

function vacationAccruedForYear(
  startDate: Date,
  year: number,
  vacationQuota: number,
): number {
  return monthsWorkedInYear(startDate, year, endOfYear(year)) * (vacationQuota / 12);
}

function vacationCarryIntoYear(
  startDate: Date,
  targetYear: number,
  absences: AbsenceLike[],
  vacationQuota: number,
  carryoverDeadline: string,
): number {
  const startYear = startDate.getUTCFullYear();
  let carry = 0;

  for (let y = startYear; y < targetYear; y++) {
    const accruedY = vacationAccruedForYear(startDate, y, vacationQuota);
    const deadline = carryoverDeadlineDate(y, carryoverDeadline);
    const usedBeforeDeadline = workingDayAbsences(
      absences,
      y,
      'VACATION',
      deadline,
    );
    const usedTotal = workingDayAbsences(absences, y, 'VACATION');
    const usedFromCarry = Math.min(carry, usedBeforeDeadline);
    const usedFromCurrentAccrual =
      usedBeforeDeadline - usedFromCarry + (usedTotal - usedBeforeDeadline);

    carry = Math.max(0, accruedY - usedFromCurrentAccrual);
  }

  return carry;
}

export interface BalanceBlockComputed {
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

export interface ComputeBalanceResult {
  asOf: string;
  workingYear: number;
  vacation: BalanceBlockComputed;
  holiday: BalanceBlockComputed;
  sick: { used: number };
}

interface ComputeArgs {
  startDate: Date;
  asOf: Date;
  absences: AbsenceLike[];
  vacationQuota: number;
  holidayQuota: number;
  carryoverDeadline: string;
}

export function computeBalance(args: ComputeArgs): ComputeBalanceResult {
  const { startDate, asOf, absences, vacationQuota, holidayQuota, carryoverDeadline } = args;
  const currentYear = asOf.getUTCFullYear();

  const vacCarry = vacationCarryIntoYear(
    startDate,
    currentYear,
    absences,
    vacationQuota,
    carryoverDeadline,
  );

  const deadline = carryoverDeadlineDate(currentYear, carryoverDeadline);
  const pastDeadline = asOf.getTime() > deadline.getTime();

  const usedVacBeforeDeadline = workingDayAbsences(
    absences,
    currentYear,
    'VACATION',
    asOf.getTime() < deadline.getTime() ? asOf : deadline,
  );

  const effectiveVacCarry = pastDeadline
    ? Math.min(vacCarry, usedVacBeforeDeadline)
    : vacCarry;
  const vacForfeited = pastDeadline
    ? Math.max(0, vacCarry - usedVacBeforeDeadline)
    : 0;

  const vacAccruedYTD =
    monthsWorkedInYear(startDate, currentYear, asOf) * (vacationQuota / 12);
  const vacAccruedYear =
    monthsWorkedInYear(startDate, currentYear, endOfYear(currentYear)) *
    (vacationQuota / 12);
  const vacUsed = workingDayAbsences(absences, currentYear, 'VACATION', asOf);

  const holAccruedYTD =
    monthsWorkedInYear(startDate, currentYear, asOf) * (holidayQuota / 12);
  const holAccruedYear =
    monthsWorkedInYear(startDate, currentYear, endOfYear(currentYear)) *
    (holidayQuota / 12);
  const holUsed = workingDayAbsences(absences, currentYear, 'HOLIDAY', asOf);

  const sickUsed = workingDayAbsences(absences, currentYear, 'SICK', asOf);

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
      carryIn: 0,
      carryInExpiresAt: null,
      carryInForfeited: 0,
      balanceToday: round1(holAccruedYTD - holUsed),
      balanceEoy: round1(holAccruedYear - holUsed),
    },
    sick: { used: sickUsed },
  };
}

/**
 * Validates prospective absences for one employee against vacation/holiday quota per affected calendar year.
 * Throws Error with message if either balance would go negative.
 */
export function assertQuotaWithinLimits(args: {
  startDate: Date;
  absencesForEmployee: AbsenceLike[];
  affectedDates: Date[];
  vacationQuota: number;
  holidayQuota: number;
  carryoverDeadline: string;
  vacationAdjustment?: number;
  holidayAdjustment?: number;
}): void {
  const {
    startDate,
    absencesForEmployee,
    affectedDates,
    vacationQuota,
    holidayQuota,
    carryoverDeadline,
    holidayAdjustment = 0,
  } = args;
  const todayUtc = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const years = new Set(affectedDates.map((d) => d.getUTCFullYear()));

  // Compute today's balance once — it doesn't change per year.
  const result = computeBalance({
    startDate,
    asOf: todayUtc,
    absences: absencesForEmployee,
    vacationQuota,
    holidayQuota,
    carryoverDeadline,
  });

  for (const Y of years) {
    const futureHoliday = absencesForEmployee.filter((absence) => {
      if (absence.type !== 'HOLIDAY') return false;
      if (absence.date.getUTCFullYear() !== Y) return false;
      if (absence.date.getTime() <= todayUtc.getTime()) return false;
      return !isWeekend(absence.date);
    }).length;

    if (result.holiday.balanceToday + holidayAdjustment - futureHoliday < 0) {
      throw new Error(`Holiday quota exceeded for ${Y}`);
    }
  }
}
