import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  format,
  eachDayOfInterval,
  isWeekend,
  isSameDay,
  parseISO,
  startOfToday,
  addMonths,
  endOfMonth,
  isLastDayOfMonth,
} from 'date-fns';
import {
  Plus,
  Download,
  Search,
  User,
  Settings,
  X,
  LogOut,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { AbsenceType } from '../types';
import { CATEGORY_COLORS } from '../constants';
import { downloadCsv, toCsv } from '../lib/csv-export';
import { useData } from '../lib/data-context';
import { useAuth } from '../lib/auth-context';
import { computeBalance } from '../lib/balance';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Quarter = 1 | 2 | 3 | 4;
const typeIndicatorColors: Record<AbsenceType, string> = {
  VACATION: 'bg-green-500',
  HOLIDAY: 'bg-blue-500',
  SICK: 'bg-red-500',
};

const isUtcWeekend = (d: Date): boolean => {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
};

function countWorkingDaysInRange(
  absences: Array<{ date: string; type: AbsenceType }>,
  type: AbsenceType,
  rangeStart: string,
  rangeEnd: string,
): number {
  return absences.filter((absence) => {
    if (absence.type !== type) return false;
    if (absence.date < rangeStart || absence.date > rangeEnd) return false;
    return !isUtcWeekend(new Date(`${absence.date}T00:00:00.000Z`));
  }).length;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const {
    loading,
    error,
    employees,
    departments,
    absences,
    config,
    upsertAbsence,
  } = useData();

  const today = startOfToday();
  const todayStr = format(today, 'yyyy-MM-dd');
  const currentYear = today.getFullYear();
  const currentQuarter = (Math.floor(today.getMonth() / 3) + 1) as Quarter;

  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<AbsenceType | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter>(currentQuarter);

  const earliestYear = useMemo(() => {
    if (employees.length === 0) return currentYear;
    return Math.min(...employees.map((employee) => parseISO(employee.startDate).getFullYear()));
  }, [employees, currentYear]);
  const latestYear = currentYear + 1;
  const maxSelectableYear = Math.max(earliestYear, latestYear);

  const yearOptions = useMemo(() => {
    const totalYears = maxSelectableYear - earliestYear + 1;
    return Array.from({ length: totalYears }, (_, index) => earliestYear + index);
  }, [earliestYear, maxSelectableYear]);

  const quarterStart = useMemo(
    () => new Date(selectedYear, (selectedQuarter - 1) * 3, 1),
    [selectedYear, selectedQuarter],
  );
  const quarterEnd = useMemo(() => endOfMonth(addMonths(quarterStart, 2)), [quarterStart]);
  const monthRangeLabel = useMemo(
    () => `${format(quarterStart, 'MMM')} - ${format(quarterEnd, 'MMM')}`,
    [quarterStart, quarterEnd],
  );
  const isTodayInSelectedQuarter =
    selectedYear === currentYear && selectedQuarter === currentQuarter;

  const calendarDays = useMemo(
    () => eachDayOfInterval({ start: quarterStart, end: quarterEnd }),
    [quarterStart, quarterEnd],
  );

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchDept = selectedDept === 'All' || emp.department === selectedDept;
      const matchSearch =
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.manager.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDept && matchSearch;
    });
  }, [employees, selectedDept, searchQuery]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  );

  const balance = useMemo(() => {
    if (!selectedEmployee) return null;
    const asOf = new Date(`${todayStr}T00:00:00.000Z`);
    const startDate = new Date(`${selectedEmployee.startDate}T00:00:00.000Z`);
    const currentYear = asOf.getUTCFullYear();

    const forEmployee = absences
      .filter((a) => a.employeeId === selectedEmployee.id)
      .map((a) => ({
        date: new Date(`${a.date}T00:00:00.000Z`),
        type: a.type,
      }));

    // Use today as asOf so carry-in / deadline logic is correct.
    const computed = computeBalance({
      startDate,
      asOf,
      absences: forEmployee,
      vacationQuota: selectedEmployee.vacationQuota ?? config.vacationQuota,
      holidayQuota: selectedEmployee.holidayQuota ?? config.holidayQuota,
      carryoverDeadline: config.carryoverDeadline,
    });

    // Count ALL working-day absences in the current year — past AND future —
    // so the card reflects planned absences the moment a cell is clicked.
    const isUtcWeekend = (d: Date) => { const day = d.getUTCDay(); return day === 0 || day === 6; };
    const countYear = (type: AbsenceType) =>
      forEmployee.filter(
        (a) => a.type === type && a.date.getUTCFullYear() === currentYear && !isUtcWeekend(a.date),
      ).length;

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const vacUsed = countYear('VACATION');
    const holUsed = countYear('HOLIDAY');
    const sickUsed = countYear('SICK');

    return {
      ...computed,
      vacation: {
        ...computed.vacation,
        used: vacUsed,
        balanceToday: round1(computed.vacation.accruedYTD + computed.vacation.carryIn - vacUsed),
      },
      holiday: {
        ...computed.holiday,
        used: holUsed,
        balanceToday: round1(computed.holiday.accruedYTD - holUsed),
      },
      sick: { used: sickUsed },
    };
  }, [selectedEmployee, absences, config, todayStr]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const previousYearRef = useRef<number>(selectedYear);

  useEffect(() => {
    if (selectedYear < earliestYear) {
      setSelectedYear(earliestYear);
      return;
    }
    if (selectedYear > maxSelectableYear) {
      setSelectedYear(maxSelectableYear);
    }
  }, [selectedYear, earliestYear, maxSelectableYear]);

  useEffect(() => {
    if (previousYearRef.current === selectedYear) return;
    previousYearRef.current = selectedYear;
    setSelectedQuarter(selectedYear === currentYear ? currentQuarter : 1);
  }, [selectedYear, currentYear, currentQuarter]);

  useEffect(() => {
    if (!isTodayInSelectedQuarter || !scrollRef.current) return;
    const todayCell = scrollRef.current.querySelector('[data-today="true"]');
    if (todayCell) {
      todayCell.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    }
  }, [employees.length, selectedYear, selectedQuarter, isTodayInSelectedQuarter]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleToggle = (employeeId: string, date: string, type: AbsenceType) => {
    void upsertAbsence(employeeId, date, type).catch((err) => {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to update absence');
    });
  };

  const handleExport = () => {
    const quarterStartStr = format(quarterStart, 'yyyy-MM-dd');
    const quarterEndStr = format(quarterEnd, 'yyyy-MM-dd');
    const effectiveAsOfBase = new Date(Math.min(today.getTime(), quarterEnd.getTime()));
    const effectiveAsOfStr = format(effectiveAsOfBase, 'yyyy-MM-dd');
    const effectiveAsOfDate = new Date(`${effectiveAsOfStr}T00:00:00.000Z`);

    const rows = [...filteredEmployees]
      .sort((a, b) => {
        const dept = a.department.localeCompare(b.department);
        if (dept !== 0) return dept;
        return a.name.localeCompare(b.name);
      })
      .map((employee) => {
        const absencesForEmployee = absences.filter((absence) => absence.employeeId === employee.id);
        const balance = computeBalance({
          startDate: new Date(`${employee.startDate}T00:00:00.000Z`),
          asOf: effectiveAsOfDate,
          absences: absencesForEmployee.map((absence) => ({
            date: new Date(`${absence.date}T00:00:00.000Z`),
            type: absence.type,
          })),
          vacationQuota: employee.vacationQuota ?? config.vacationQuota,
          holidayQuota: employee.holidayQuota ?? config.holidayQuota,
          carryoverDeadline: config.carryoverDeadline,
        });

        return {
          employee: employee.name,
          department: employee.department,
          manager: employee.manager,
          contractStart: employee.startDate,
          year: selectedYear,
          quarter: `Q${selectedQuarter}`,
          asOf: effectiveAsOfStr,
          vacationUsedQuarter: countWorkingDaysInRange(
            absencesForEmployee,
            'VACATION',
            quarterStartStr,
            quarterEndStr,
          ),
          holidayUsedQuarter: countWorkingDaysInRange(
            absencesForEmployee,
            'HOLIDAY',
            quarterStartStr,
            quarterEndStr,
          ),
          sickUsedQuarter: countWorkingDaysInRange(
            absencesForEmployee,
            'SICK',
            quarterStartStr,
            quarterEndStr,
          ),
          vacationUsedYtd: balance.vacation.used,
          holidayUsedYtd: balance.holiday.used,
          sickUsedYtd: balance.sick.used,
          vacationLeft: balance.vacation.balanceToday,
          holidayLeft: balance.holiday.balanceToday,
        };
      });

    const csv = toCsv(rows, [
      { key: 'employee', header: 'Employee' },
      { key: 'department', header: 'Department' },
      { key: 'manager', header: 'Manager' },
      { key: 'contractStart', header: 'Contract start' },
      { key: 'year', header: 'Year' },
      { key: 'quarter', header: 'Quarter' },
      { key: 'asOf', header: 'As of' },
      { key: 'vacationUsedQuarter', header: 'Vacation used (quarter)' },
      { key: 'holidayUsedQuarter', header: 'Holiday used (quarter)' },
      { key: 'sickUsedQuarter', header: 'Sick used (quarter)' },
      { key: 'vacationUsedYtd', header: 'Vacation used (YTD)' },
      { key: 'holidayUsedYtd', header: 'Holiday used (YTD)' },
      { key: 'sickUsedYtd', header: 'Sick used (YTD)' },
      { key: 'vacationLeft', header: 'Vacation left' },
      { key: 'holidayLeft', header: 'Holiday left' },
    ]);

    const filename = `employee_balances_${selectedDept}_${selectedYear}_Q${selectedQuarter}.csv`;
    downloadCsv(filename, csv);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F1F5F9] text-slate-400 text-xs uppercase tracking-widest font-bold">
        Loading data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F1F5F9] gap-4">
        <AlertTriangle className="w-8 h-8 text-red-500" />
        <p className="text-sm font-bold text-slate-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F1F5F9] text-[#1E293B] font-sans overflow-hidden p-6 gap-6">
      <aside className="relative z-50 w-64 shrink-0 flex flex-col">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-slate-900 rounded flex items-center justify-center text-white font-bold shrink-0">
                FH
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-tight text-slate-900 leading-tight">
                  Absence Tracker
                </h1>
              </div>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search staff..."
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <p className="text-[9px] uppercase tracking-wider font-bold text-slate-400 px-2 mb-1">
                  Departments
                </p>
                <div className="space-y-0.5 overflow-y-auto max-h-[300px] pr-1">
                  {['All', ...departments.map((d) => d.name)].map((dept) => (
                    <button
                      key={dept}
                      onClick={() => setSelectedDept(dept)}
                      className={cn(
                        'w-full text-left px-2 py-1.5 rounded-lg text-xs font-semibold transition-all',
                        selectedDept === dept
                          ? 'bg-slate-900 text-white shadow-md shadow-slate-200'
                          : 'hover:bg-slate-50 text-slate-600',
                      )}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-auto border-t border-slate-100 bg-slate-50/50 p-5">
            <div className="flex min-h-9 items-center gap-3">
              <div className="w-8 h-8 shrink-0 rounded-lg border border-slate-200 bg-white shadow-sm flex items-center justify-center">
                <User className="w-4 h-4 text-slate-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{user?.name ?? 'User'}</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-red-500"
                  >
                    <LogOut className="w-2 h-2" /> Logout
                  </button>
                </div>
              </div>
              {isAdmin ? (
                <Link
                  to="/settings"
                  title="System settings"
                  aria-label="Open system settings"
                  className="ml-auto flex shrink-0 items-center justify-center rounded-md p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                >
                  <Settings className="pointer-events-none h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 gap-6">
        <header className="flex items-center justify-between z-10 shrink-0 h-14">
          <div className="grid grid-cols-[14rem_auto] items-center">
            <div className="pr-6 border-r border-slate-200">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Consolidated Schedule
              </h2>
            </div>

            <div className="flex flex-col pl-6">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Today
              </span>
              <span className="text-sm font-mono font-bold text-slate-700">
                {format(today, 'dd MMM yyyy').toUpperCase()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
              <label htmlFor="dashboard-year-select" className="sr-only">
                Select calendar year
              </label>
              <select
                id="dashboard-year-select"
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
                className="h-7 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none transition-colors hover:border-slate-300 focus:ring-2 focus:ring-blue-500/20"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <button
                type="button"
                aria-label="Previous quarter"
                onClick={() =>
                  setSelectedQuarter((quarter) => Math.max(1, quarter - 1) as Quarter)
                }
                disabled={selectedQuarter === 1}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <span className="whitespace-nowrap text-[11px] font-mono font-semibold uppercase text-slate-600">
                Q{selectedQuarter} {selectedYear} &middot; {monthRangeLabel}
              </span>

              <button
                type="button"
                aria-label="Next quarter"
                onClick={() =>
                  setSelectedQuarter((quarter) => Math.min(4, quarter + 1) as Quarter)
                }
                disabled={selectedQuarter === 4}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex bg-white border border-slate-200 p-1 rounded-lg shadow-sm">
              {(['VACATION', 'HOLIDAY', 'SICK'] as AbsenceType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type === selectedType ? 'All' : type)}
                  className={cn(
                    'px-3 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-2',
                    selectedType === type
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:bg-slate-50',
                  )}
                >
                  <div
                    className={cn(
                      'w-2 h-2 rounded-sm',
                      typeIndicatorColors[type],
                    )}
                  />
                  {type}
                </button>
              ))}
            </div>
            {isAdmin ? (
              <Link
                to="/settings"
                title="System settings"
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <Settings className="pointer-events-none h-3.5 w-3.5 text-slate-500" />
                Settings
              </Link>
            ) : null}
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </header>

        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col mt-2">
          <div className="flex-1 overflow-auto relative scroll-smooth bg-white" ref={scrollRef}>
            <div className="inline-block min-w-full">
              <div className="sticky top-0 z-40 flex bg-slate-50/90 backdrop-blur-sm">
                <div className="sticky left-0 z-50 w-56 h-6 border-r border-slate-200 bg-slate-50 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  <div className="h-full px-4 flex items-center text-[10px] uppercase tracking-wider font-bold text-slate-500">
                    Employee &amp; Metrics
                  </div>
                </div>
                {calendarDays.map((day) => {
                  const isSatSun = isWeekend(day);
                  const isMonthEnd = isLastDayOfMonth(day);
                  return (
                    <div
                      key={`month-${day.toISOString()}`}
                      className={cn(
                        'w-10 h-6 border-b border-r border-slate-200 flex items-center justify-center text-[9px] uppercase font-semibold text-slate-500',
                        isMonthEnd && 'border-r-2 border-r-slate-400',
                        isSatSun && 'text-slate-400 bg-slate-50/60',
                      )}
                    >
                      {format(day, 'MMM')}
                    </div>
                  );
                })}
              </div>
              <table className="border-separate border-spacing-0 table-fixed w-full">
                <thead>
                  <tr className="bg-slate-50/80 backdrop-blur-sm sticky top-6 z-30">
                    <th className="sticky left-0 z-50 bg-slate-50 border-b border-r border-slate-200 w-56 p-0 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                      <div className="h-10" />
                    </th>
                    {calendarDays.map((day) => {
                      const isToday = isSameDay(day, today);
                      const isSatSun = isWeekend(day);
                      const isMonthEnd = isLastDayOfMonth(day);
                      return (
                        <th
                          key={day.toISOString()}
                          className={cn(
                            'w-10 h-10 border-b border-r border-slate-200 font-normal p-0',
                            isMonthEnd && 'border-r-2 border-r-slate-400',
                            isToday && 'bg-slate-900 text-white',
                            isSatSun && !isToday && 'bg-slate-100 text-slate-400',
                          )}
                          data-today={isToday}
                        >
                          <div className="flex flex-col items-center justify-center h-full">
                            <span className="text-[10px] font-bold">{format(day, 'd')}</span>
                            <span className="text-[8px] uppercase font-medium opacity-70">
                              {format(day, 'EEE')}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="group transition-colors text-xs">
                      <td
                        className={cn(
                          'relative sticky left-0 z-30 cursor-pointer overflow-hidden border-b border-r border-slate-200 bg-white p-0 shadow-[2px_0_5px_rgba(0,0,0,0.02)] transition-colors',
                          selectedEmployeeId === emp.id
                            ? 'bg-blue-50 group-hover:bg-blue-100'
                            : 'group-hover:bg-slate-50',
                        )}
                        onClick={() =>
                          setSelectedEmployeeId(emp.id === selectedEmployeeId ? null : emp.id)
                        }
                      >
                        <div className="flex flex-col px-4 py-2.5">
                          <span className="text-xs font-bold text-slate-900 leading-tight">
                            {emp.name}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono uppercase tracking-tighter mt-0.5">
                            {emp.department} &bull; {emp.manager.split(' ')[0]}
                          </span>
                        </div>
                        {selectedEmployeeId === emp.id && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                        )}
                      </td>
                      {calendarDays.map((day) => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const record = absences.find(
                          (a) => a.employeeId === emp.id && a.date === dateStr,
                        );
                        const isSatSun = isWeekend(day);
                        const isMonthEnd = isLastDayOfMonth(day);
                        return (
                          <td
                            key={`${emp.id}-${dateStr}`}
                            className={cn(
                              'w-10 h-10 border-b border-r border-slate-100 p-0.5 relative group-hover:bg-slate-50/30 transition-colors',
                              isMonthEnd && 'border-r-2 border-r-slate-400',
                              isSatSun && 'bg-slate-50/50',
                            )}
                            onClick={() => {
                              if (isSatSun) return;
                              setSelectedEmployeeId(emp.id);
                              const nextType = (selectedType === 'All' ? 'VACATION' : selectedType) as AbsenceType;
                              if (selectedType === 'All') setSelectedType('VACATION');
                              handleToggle(emp.id, dateStr, nextType);
                            }}
                          >
                            <div className="w-full h-full cursor-pointer relative">
                              {record && (
                                <motion.div
                                  layoutId={`${emp.id}-${dateStr}`}
                                  className={cn(
                                    'w-full h-full rounded shadow-sm border-l-4 flex items-center justify-center p-1',
                                    CATEGORY_COLORS[record.type],
                                  )}
                                  initial={{ scale: 0.9, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                >
                                  <span className="text-[9px] font-mono font-bold leading-none">
                                    {record.type[0]}
                                  </span>
                                </motion.div>
                              )}
                              {!record && !isSatSun && (
                                <div className="w-full h-full opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <div className="w-4 h-4 rounded bg-slate-100 flex items-center justify-center text-slate-300">
                                    <Plus className="w-2 h-2" />
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {selectedEmployee && balance && (
            <motion.div
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 200, opacity: 0 }}
              className="grid grid-cols-4 gap-4 z-30 shrink-0"
            >
              <div className="bg-slate-900 rounded-xl p-4 text-white shadow-lg flex flex-col justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center font-bold text-lg">
                    {selectedEmployee.name[0]}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate">{selectedEmployee.name}</h3>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {selectedEmployee.department.toUpperCase()}
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-end">
                  <div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                      Start Date
                    </p>
                    <p className="text-xs font-mono">
                      {format(parseISO(selectedEmployee.startDate), 'dd.MM.yyyy')}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedEmployeeId(null)}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-green-200 transition-colors">
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Vacation Balance
                </div>
                <div className="flex justify-between items-end">
                  <div className="text-3xl font-mono font-bold text-green-600">
                    {balance.vacation.balanceToday}
                    <span className="text-sm font-normal text-slate-400 ml-1">
                      / {balance.vacation.accruedYear}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-slate-400 uppercase font-bold tracking-tight leading-none mb-1">
                      Used YTD
                    </div>
                    <div className="text-xs font-mono font-bold text-slate-700">
                      {balance.vacation.used}.0 d
                    </div>
                    {balance.vacation.carryIn > 0 && (
                      <div className="text-[9px] text-slate-400 mt-1">
                        Carry in {balance.vacation.carryIn}d
                        {balance.vacation.carryInForfeited > 0 &&
                          ` (forfeited ${balance.vacation.carryInForfeited}d)`}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-blue-200 transition-colors">
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Holiday Balance
                </div>
                <div className="flex justify-between items-end">
                  <div className="text-3xl font-mono font-bold text-blue-600">
                    {balance.holiday.balanceToday}
                    <span className="text-sm font-normal text-slate-400 ml-1">
                      / {balance.holiday.accruedYear}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-slate-400 uppercase font-bold tracking-tight leading-none mb-1">
                      Quota
                    </div>
                    <div className="text-xs font-mono font-bold text-slate-700">
                      {config.holidayQuota}.0 d
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:border-red-200 transition-colors">
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  Sick Days Total
                </div>
                <div className="flex justify-between items-end">
                  <div className="text-3xl font-mono font-bold text-red-600">
                    {balance.sick.used}
                    <span className="text-xs font-normal text-slate-400 ml-1">Days</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-slate-400 uppercase font-bold tracking-tight leading-none mb-1">
                      Status
                    </div>
                    <div className="text-xs font-mono font-bold text-slate-700 uppercase">
                      Tracked
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
