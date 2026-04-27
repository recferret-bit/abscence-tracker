import { AbsenceType } from '../src/prisma/client';

import { __testing } from '../src/balance/balance.service';

const { computeBalance, monthsWorkedInYear } = __testing;

const utc = (s: string) => new Date(s + 'T00:00:00.000Z');

const absence = (date: string, type: AbsenceType, employeeId = 'e1') => ({
  id: `a-${date}`,
  employeeId,
  date: utc(date),
  type,
  createdAt: new Date(),
});

const SETTINGS = {
  vacationQuota: 20,
  holidayQuota: 17,
  carryoverDeadline: '06-30',
};

describe('monthsWorkedInYear', () => {
  it('counts months for an employee starting before the year', () => {
    expect(monthsWorkedInYear(utc('2020-05-01'), 2026, utc('2026-04-20'))).toBe(4);
    expect(monthsWorkedInYear(utc('2020-05-01'), 2026, utc('2026-12-31'))).toBe(12);
  });

  it('counts only months whose first day is on/after start date', () => {
    expect(monthsWorkedInYear(utc('2025-07-15'), 2025, utc('2025-12-31'))).toBe(5);
    expect(monthsWorkedInYear(utc('2025-07-01'), 2025, utc('2025-12-31'))).toBe(6);
  });

  it('returns 0 when upTo is before any qualifying month', () => {
    expect(monthsWorkedInYear(utc('2026-03-15'), 2026, utc('2026-03-30'))).toBe(0);
  });
});

describe('computeBalance', () => {
  it('prorates the first (partial) year by full months', () => {
    const result = computeBalance({
      startDate: utc('2025-07-15'),
      asOf: utc('2025-12-31'),
      absences: [],
      ...SETTINGS,
    });

    // Aug..Dec = 5 months → 5 * 20/12 ≈ 8.3
    expect(result.vacation.accruedYTD).toBe(8.3);
    expect(result.vacation.accruedYear).toBe(8.3);
    expect(result.vacation.balanceToday).toBe(8.3);
    expect(result.vacation.carryIn).toBe(0);

    // Holiday same proration: 5 * 17/12 ≈ 7.1
    expect(result.holiday.accruedYear).toBe(7.1);
    expect(result.holiday.balanceEoy).toBe(7.1);
  });

  it('carries unused vacation from a 2025 contract start into 2026', () => {
    const result = computeBalance({
      startDate: utc('2025-07-15'),
      asOf: utc('2026-04-15'),
      absences: [],
      ...SETTINGS,
    });

    expect(result.vacation.carryIn).toBe(8.3);
    expect(result.vacation.carryInForfeited).toBe(0);
    expect(result.vacation.accruedYTD).toBe(6.7);
    expect(result.vacation.used).toBe(0);
    expect(result.vacation.balanceToday).toBe(15);
  });

  it('uses transferred 2025 vacation before 2026 accrual', () => {
    const result = computeBalance({
      startDate: utc('2025-07-15'),
      asOf: utc('2027-04-15'),
      absences: [
        absence('2026-04-01', AbsenceType.VACATION),
        absence('2026-04-02', AbsenceType.VACATION),
        absence('2026-04-03', AbsenceType.VACATION),
        absence('2026-04-06', AbsenceType.VACATION),
        absence('2026-04-07', AbsenceType.VACATION),
      ],
      ...SETTINGS,
    });

    expect(result.vacation.carryIn).toBe(20);
    expect(result.vacation.carryInForfeited).toBe(0);
    expect(result.vacation.accruedYTD).toBe(6.7);
    expect(result.vacation.used).toBe(0);
    expect(result.vacation.balanceToday).toBe(26.7);
  });

  it('forfeits only unused transferred vacation after June 30', () => {
    const result = computeBalance({
      startDate: utc('2025-07-15'),
      asOf: utc('2026-07-15'),
      absences: [
        absence('2026-04-01', AbsenceType.VACATION),
        absence('2026-04-02', AbsenceType.VACATION),
        absence('2026-04-03', AbsenceType.VACATION),
        absence('2026-04-06', AbsenceType.VACATION),
        absence('2026-04-07', AbsenceType.VACATION),
      ],
      ...SETTINGS,
    });

    expect(result.vacation.carryIn).toBe(5);
    expect(result.vacation.carryInForfeited).toBe(3.3);
    expect(result.vacation.accruedYTD).toBe(11.7);
    expect(result.vacation.used).toBe(5);
    expect(result.vacation.balanceToday).toBe(11.7);
  });

  it('vacation carryover survives if used before June 30', () => {
    const result = computeBalance({
      startDate: utc('2025-01-01'),
      asOf: utc('2026-06-15'),
      absences: [
        // 2025: accrued 20, used 17 → carry 3 into 2026
        ...['2025-01-06','2025-01-07','2025-01-08','2025-01-09','2025-01-10',
            '2025-02-03','2025-02-04','2025-02-05','2025-02-06','2025-02-07',
            '2025-03-03','2025-03-04','2025-03-05','2025-03-06','2025-03-07',
            '2025-04-07','2025-04-08'].map((d) => absence(d, AbsenceType.VACATION)),
        // 2026: used 2 vacation days before June 15
        absence('2026-04-01', AbsenceType.VACATION),
        absence('2026-04-02', AbsenceType.VACATION),
      ],
      ...SETTINGS,
    });

    expect(result.vacation.carryIn).toBe(3);
    expect(result.vacation.carryInForfeited).toBe(0);
    // Jan..Jun = 6 months → 6 * 20/12 = 10 accruedYTD
    expect(result.vacation.accruedYTD).toBe(10);
    expect(result.vacation.used).toBe(2);
    // 10 + 3 - 2 = 11
    expect(result.vacation.balanceToday).toBe(11);
  });

  it('vacation carryover is partially forfeited after June 30', () => {
    const result = computeBalance({
      startDate: utc('2025-01-01'),
      asOf: utc('2026-07-15'),
      absences: [
        // 2025: accrued 20, used 17 → carry 3 into 2026
        ...['2025-01-06','2025-01-07','2025-01-08','2025-01-09','2025-01-10',
            '2025-02-03','2025-02-04','2025-02-05','2025-02-06','2025-02-07',
            '2025-03-03','2025-03-04','2025-03-05','2025-03-06','2025-03-07',
            '2025-04-07','2025-04-08'].map((d) => absence(d, AbsenceType.VACATION)),
        // 2026: only 1 vacation day used before June 30
        absence('2026-04-01', AbsenceType.VACATION),
      ],
      ...SETTINGS,
    });

    // Used before deadline = 1, carryIn was 3 → effective carry = 1, forfeited = 2
    expect(result.vacation.carryIn).toBe(1);
    expect(result.vacation.carryInForfeited).toBe(2);
    // Jan..Jul = 7 months → 7 * 20/12 ≈ 11.7
    expect(result.vacation.accruedYTD).toBe(11.7);
    expect(result.vacation.used).toBe(1);
    // 11.7 + 1 - 1 = 11.7
    expect(result.vacation.balanceToday).toBe(11.7);
  });

  it('holiday carryover is always 0 (TZ REQ-04 burns at year end)', () => {
    const result = computeBalance({
      startDate: utc('2024-01-01'),
      asOf: utc('2026-04-20'),
      absences: [
        // 2025: only used 1 holiday → 16 unused → STILL 0 carry-in for 2026
        absence('2025-12-22', AbsenceType.HOLIDAY),
      ],
      ...SETTINGS,
    });

    expect(result.holiday.carryIn).toBe(0);
    expect(result.holiday.carryInExpiresAt).toBeNull();
  });

  it('counts sick days as unbounded, no quota', () => {
    const result = computeBalance({
      startDate: utc('2024-01-01'),
      asOf: utc('2026-04-20'),
      absences: [
        absence('2026-01-05', AbsenceType.SICK),
        absence('2026-02-10', AbsenceType.SICK),
        absence('2026-03-11', AbsenceType.SICK),
      ],
      ...SETTINGS,
    });

    expect(result.sick.used).toBe(3);
  });

  it('ignores weekend absence rows in used counts', () => {
    const result = computeBalance({
      startDate: utc('2024-01-01'),
      asOf: utc('2026-04-20'),
      absences: [
        absence('2026-04-04', AbsenceType.VACATION), // Saturday
        absence('2026-04-06', AbsenceType.VACATION), // Monday
      ],
      ...SETTINGS,
    });

    expect(result.vacation.used).toBe(1);
  });
});
