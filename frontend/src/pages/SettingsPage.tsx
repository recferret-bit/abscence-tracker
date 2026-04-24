import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Settings as SettingsIcon,
  Trash2,
  Plus,
  Save,
  ArrowLeft,
  Briefcase,
  AlertCircle,
  Search,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';

import { BalanceResponse, Employee } from '../types';
import { useData } from '../lib/data-context';
import { ApiError, api } from '../lib/api';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Empty string → inherit global default (null). Invalid input → error. */
function parseOptionalAnnualQuota(
  raw: string,
): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim();
  if (t === '') return { ok: true, value: null };
  const n = Number.parseInt(t, 10);
  if (Number.isNaN(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

function parseSignedInteger(raw: string): { ok: true; value: number } | { ok: false } {
  const t = raw.trim();
  if (t === '') return { ok: true, value: 0 };
  const n = Number.parseInt(t, 10);
  if (Number.isNaN(n)) return { ok: false };
  return { ok: true, value: n };
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const {
    loading,
    error,
    employees,
    departments,
    config,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    createDepartment,
    deleteDepartment,
    updateConfig,
  } = useData();

  const [activeTab, setActiveTab] = useState<'personnel' | 'org'>('personnel');
  const [newDeptName, setNewDeptName] = useState('');
  const [submittingDept, setSubmittingDept] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empVacQuotaEdit, setEmpVacQuotaEdit] = useState('');
  const [empHolQuotaEdit, setEmpHolQuotaEdit] = useState('');
  const [empVacAdjustmentEdit, setEmpVacAdjustmentEdit] = useState('0');
  const [empHolAdjustmentEdit, setEmpHolAdjustmentEdit] = useState('0');
  const [empSickAdjustmentEdit, setEmpSickAdjustmentEdit] = useState('0');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [balancesByEmployee, setBalancesByEmployee] = useState<Record<string, BalanceResponse>>(
    {},
  );

  const todayIso = new Date().toISOString().split('T')[0];

  // Local mirror of quotas so inputs aren't blocked by network round-trip
  const [vacationQuota, setVacationQuota] = useState<string>(String(config.vacationQuota));
  const [holidayQuota, setHolidayQuota] = useState<string>(String(config.holidayQuota));

  useEffect(() => {
    setVacationQuota(String(config.vacationQuota));
    setHolidayQuota(String(config.holidayQuota));
  }, [config.vacationQuota, config.holidayQuota]);

  useEffect(() => {
    let cancelled = false;

    const loadBalances = async () => {
      if (employees.length === 0) {
        setBalancesByEmployee({});
        return;
      }

      try {
        const entries = await Promise.all(
          employees.map(async (employee) => [employee.id, await api.getBalance(employee.id)] as const),
        );
        if (!cancelled) {
          setBalancesByEmployee(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) {
          setBalancesByEmployee({});
        }
      }
    };

    void loadBalances();
    return () => {
      cancelled = true;
    };
  }, [employees]);

  const persistQuota = async (key: 'vacationQuota' | 'holidayQuota', raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) return;
    if (parsed === config[key]) return;
    try {
      await updateConfig({ [key]: parsed });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to update settings');
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('Delete this employee and all their records?')) return;
    try {
      await deleteEmployee(id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete employee');
    }
  };

  const handleAddEmployee = async () => {
    const dept = departments[0];
    if (!dept) {
      alert('Create a department first.');
      return;
    }
    try {
      await createEmployee({
        name: 'New Employee',
        departmentId: dept.id,
        manager: 'Manager Name',
        startDate: todayIso,
      });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to add employee');
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newDeptName.trim();
    if (!name) {
      alert('Enter a department name.');
      return;
    }
    setSubmittingDept(true);
    try {
      await createDepartment(name);
      setNewDeptName('');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to add department');
    } finally {
      setSubmittingDept(false);
    }
  };

  const handleDeleteDepartment = async (id: string, name: string) => {
    if (!confirm(`Delete the "${name}" department?`)) return;
    try {
      await deleteDepartment(id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete department');
    }
  };

  const beginEditEmployee = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpVacQuotaEdit(emp.vacationQuota === null ? '' : String(emp.vacationQuota));
    setEmpHolQuotaEdit(emp.holidayQuota === null ? '' : String(emp.holidayQuota));
    setEmpVacAdjustmentEdit(String(emp.vacationAdjustment));
    setEmpHolAdjustmentEdit(String(emp.holidayAdjustment));
    setEmpSickAdjustmentEdit(String(emp.sickAdjustment));
  };

  const cancelEditEmployee = () => {
    setEditingEmp(null);
    setEmpVacQuotaEdit('');
    setEmpHolQuotaEdit('');
    setEmpVacAdjustmentEdit('0');
    setEmpHolAdjustmentEdit('0');
    setEmpSickAdjustmentEdit('0');
  };

  const handleSaveEmployee = async () => {
    if (!editingEmp) return;
    const v = parseOptionalAnnualQuota(empVacQuotaEdit);
    const h = parseOptionalAnnualQuota(empHolQuotaEdit);
    const vacAdj = parseSignedInteger(empVacAdjustmentEdit);
    const holAdj = parseSignedInteger(empHolAdjustmentEdit);
    const sickAdj = parseSignedInteger(empSickAdjustmentEdit);
    const originalStartDate = employees.find((e) => e.id === editingEmp.id)?.startDate;
    const startDateChanged = editingEmp.startDate !== originalStartDate;
    if (startDateChanged && editingEmp.startDate > todayIso) {
      alert('Contract start date cannot be in the future.');
      return;
    }
    if (!v.ok || !h.ok) {
      alert('Enter non-negative whole numbers for annual quotas, or leave blank to use global defaults.');
      return;
    }
    if (!vacAdj.ok || !holAdj.ok || !sickAdj.ok) {
      alert('Enter whole numbers for balance adjustments.');
      return;
    }
    try {
      await updateEmployee(editingEmp.id, {
        name: editingEmp.name,
        departmentId: editingEmp.departmentId,
        manager: editingEmp.manager,
        startDate: editingEmp.startDate,
        vacationQuota: v.value,
        holidayQuota: h.value,
        vacationAdjustment: vacAdj.value,
        holidayAdjustment: holAdj.value,
        sickAdjustment: sickAdj.value,
      });
      cancelEditEmployee();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to save employee');
    }
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesName =
        normalizedQuery === '' || emp.name.toLowerCase().includes(normalizedQuery);
      const matchesDept =
        selectedDeptIds.length === 0 || selectedDeptIds.includes(emp.departmentId);
      return matchesName && matchesDept;
    });
  }, [employees, normalizedQuery, selectedDeptIds]);

  const filtersActive = searchQuery.trim() !== '' || selectedDeptIds.length > 0;

  const toggleDept = (id: string) =>
    setSelectedDeptIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );

  const clearPersonnelFilters = () => {
    setSearchQuery('');
    setSelectedDeptIds([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F1F5F9] text-slate-400 text-xs uppercase tracking-widest font-bold">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F1F5F9] text-red-600 text-sm font-bold">
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F1F5F9] text-[#1E293B] font-sans overflow-hidden p-6 gap-6">
      <aside className="w-64 shrink-0 flex flex-col gap-6">
        <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex items-center gap-3 mb-8">
            <SettingsIcon className="w-6 h-6 text-blue-400" />
            <h1 className="font-bold text-lg tracking-tight">System Settings</h1>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('personnel')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all',
                activeTab === 'personnel'
                  ? 'bg-white/10 text-white'
                  : 'hover:bg-white/5 text-slate-400',
              )}
            >
              <Users className="w-4 h-4" /> Personnel
            </button>
            <button
              onClick={() => setActiveTab('org')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all',
                activeTab === 'org'
                  ? 'bg-white/10 text-white'
                  : 'hover:bg-white/5 text-slate-400',
              )}
            >
              <Briefcase className="w-4 h-4" /> Org Structure
            </button>
          </nav>

          <button
            onClick={() => navigate('/')}
            className="mt-12 w-full flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Exit to Tracker
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex-1">
          <h2 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-4">
            Global Quotas
          </h2>
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-600 block leading-none">
                Vacation Days
              </label>
              <input
                type="number"
                value={vacationQuota}
                onChange={(e) => setVacationQuota(e.target.value)}
                onBlur={() => persistQuota('vacationQuota', vacationQuota)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500/20 bg-slate-50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-600 block leading-none">
                Holiday Days
              </label>
              <input
                type="number"
                value={holidayQuota}
                onChange={(e) => setHolidayQuota(e.target.value)}
                onBlur={() => persistQuota('holidayQuota', holidayQuota)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500/20 bg-slate-50"
              />
            </div>
            <div className="p-3 bg-blue-50/50 rounded-xl flex gap-3 text-blue-700 border border-blue-100">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p className="text-[10px] font-medium leading-tight select-none">
                Quota changes propagate instantly across the dashboard for all active fiscal years.
              </p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {activeTab === 'personnel' && (
          <>
            <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Personnel Directory
                </h2>
                <p className="text-xs text-slate-500 font-mono">
                  {filtersActive
                    ? `Showing ${filteredEmployees.length} of ${employees.length} active staff`
                    : `Archive management for ${employees.length} active staff`}
                </p>
              </div>
              <button
                onClick={handleAddEmployee}
                className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-md active:scale-95"
              >
                <Plus className="w-4 h-4" />
                Register Staff
              </button>
            </header>

            <div className="flex-1 overflow-auto p-8">
              <div className="mb-6 space-y-4">
                <div className="flex flex-col lg:flex-row gap-4 lg:items-start">
                  <div className="relative flex-1 min-w-0">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                      aria-hidden
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name..."
                      className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm font-medium placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 outline-none bg-slate-50/50"
                    />
                    {searchQuery !== '' && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        aria-label="Clear search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 lg:max-w-xl lg:justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedDeptIds([])}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                        selectedDeptIds.length === 0
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                      )}
                    >
                      All
                    </button>
                    {departments.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDept(d.id)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                          selectedDeptIds.includes(d.id)
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                        )}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-mono">
                  <span>
                    Showing {filteredEmployees.length} of {employees.length}
                  </span>
                  {filtersActive && (
                    <button
                      type="button"
                      onClick={clearPersonnelFilters}
                      className="text-blue-600 font-bold hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {filteredEmployees.length === 0 && employees.length > 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-16 px-6 text-center">
                    <p className="text-sm font-semibold text-slate-700 mb-1">
                      No staff match the current filters
                    </p>
                    <p className="text-xs text-slate-500 font-mono mb-4">
                      Try a different name or department selection.
                    </p>
                    <button
                      type="button"
                      onClick={clearPersonnelFilters}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  filteredEmployees.map((emp) => {
                  const balance = balancesByEmployee[emp.id];
                  return (
                  <motion.div
                    key={emp.id}
                    layout
                    className={cn(
                      'p-4 rounded-2xl border transition-all',
                      editingEmp?.id === emp.id
                        ? 'border-blue-500 ring-4 ring-blue-200 bg-blue-50'
                        : 'border-slate-100 hover:border-slate-200 bg-white',
                    )}
                  >
                    {editingEmp?.id === emp.id ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase font-bold text-slate-400">
                              Legal Name
                            </label>
                            <input
                              type="text"
                              value={editingEmp.name}
                              onChange={(e) =>
                                setEditingEmp({ ...editingEmp, name: e.target.value })
                              }
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase font-bold text-slate-400">
                              Primary Assignment
                            </label>
                            <select
                              value={editingEmp.departmentId}
                              onChange={(e) => {
                                const dept = departments.find((d) => d.id === e.target.value);
                                setEditingEmp({
                                  ...editingEmp,
                                  departmentId: e.target.value,
                                  department: dept?.name ?? editingEmp.department,
                                });
                              }}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium"
                            >
                              {departments.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase font-bold text-slate-400">
                              Direct Manager
                            </label>
                            <input
                              type="text"
                              value={editingEmp.manager}
                              onChange={(e) =>
                                setEditingEmp({ ...editingEmp, manager: e.target.value })
                              }
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase font-bold text-slate-400">
                              Contract Start
                            </label>
                            <input
                              type="date"
                              value={editingEmp.startDate}
                              max={todayIso}
                              onChange={(e) => {
                                setEditingEmp({ ...editingEmp, startDate: e.target.value });
                              }}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase font-bold text-slate-400">
                              Annual vacation quota
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={empVacQuotaEdit}
                              onChange={(e) => setEmpVacQuotaEdit(e.target.value)}
                              placeholder={`Default ${config.vacationQuota}`}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500/20"
                            />
                            <p className="text-[10px] text-slate-400 leading-tight">
                              Empty = global default ({config.vacationQuota} days)
                            </p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase font-bold text-slate-400">
                              Annual holiday quota
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={empHolQuotaEdit}
                              onChange={(e) => setEmpHolQuotaEdit(e.target.value)}
                              placeholder={`Default ${config.holidayQuota}`}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500/20"
                            />
                            <p className="text-[10px] text-slate-400 leading-tight">
                              Empty = global default ({config.holidayQuota} days)
                            </p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase font-bold text-slate-400">
                              Vacation adjustment
                            </label>
                            <input
                              type="number"
                              step={1}
                              value={empVacAdjustmentEdit}
                              onChange={(e) => setEmpVacAdjustmentEdit(e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500/20"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase font-bold text-slate-400">
                              Holiday adjustment
                            </label>
                            <input
                              type="number"
                              step={1}
                              value={empHolAdjustmentEdit}
                              onChange={(e) => setEmpHolAdjustmentEdit(e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500/20"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] uppercase font-bold text-slate-400">
                              Sick adjustment
                            </label>
                            <input
                              type="number"
                              step={1}
                              value={empSickAdjustmentEdit}
                              onChange={(e) => setEmpSickAdjustmentEdit(e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500/20"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end pt-2 border-t border-blue-100">
                          <button
                            onClick={cancelEditEmployee}
                            className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg"
                          >
                            Discard
                          </button>
                          <button
                            onClick={handleSaveEmployee}
                            className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-2 hover:bg-blue-700"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Commit
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 font-mono">
                            {emp.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .substring(0, 2)}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                              {emp.name}
                            </h3>
                            <p className="text-[10px] text-slate-400 font-mono uppercase truncate max-w-[14rem]">
                              {emp.department} &bull;{' '}
                              <span className="text-blue-500/70">{emp.manager}</span>
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono mt-1">
                              Vac {emp.vacationQuota ?? config.vacationQuota}d · Hol{' '}
                              {emp.holidayQuota ?? config.holidayQuota}d
                              {(emp.vacationQuota !== null || emp.holidayQuota !== null) && (
                                <span className="text-amber-600/90 font-semibold ml-1.5">
                                  override
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono mt-1">
                              Vac {balance ? `${balance.vacation.balanceToday.toFixed(1)}d` : '--'} avail · Hol{' '}
                              {balance ? `${balance.holiday.balanceToday.toFixed(1)}d` : '--'} avail · Sick{' '}
                              {balance ? `${balance.sick.used}d` : '--'} used
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => beginEditEmployee(emp)}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all"
                          >
                            <SettingsIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteEmployee(emp.id)}
                            className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                  );
                  })
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'org' && (
          <>
            <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Organization Structure
                </h2>
                <p className="text-xs text-slate-500 font-mono">
                  Logic isolation and department metadata
                </p>
              </div>
              <form onSubmit={handleAddDepartment} className="flex gap-2">
                <input
                  type="text"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="Department name"
                  disabled={submittingDept}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500/20 outline-none disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!newDeptName.trim() || submittingDept}
                  className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 disabled:opacity-50 transition-all flex items-center gap-2 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  {submittingDept ? 'Saving…' : 'Register Unit'}
                </button>
              </form>
            </header>

            <div className="flex-1 overflow-auto p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {departments.map((dept) => {
                  const deptCount = employees.filter((e) => e.departmentId === dept.id).length;
                  return (
                    <motion.div
                      key={dept.id}
                      layout
                      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-slate-300 transition-all relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                          {deptCount}
                        </div>
                        <button
                          onClick={() => handleDeleteDepartment(dept.id, dept.name)}
                          className="p-2 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <h3 className="font-bold text-slate-900 tracking-tight">{dept.name}</h3>
                      <p className="text-[10px] text-slate-400 font-mono mt-1 uppercase tracking-wider">
                        Functional Unit
                      </p>

                      <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          {deptCount} Personnel Assigned
                        </span>
                      </div>

                      <div
                        className={cn(
                          'absolute top-0 right-0 w-1 h-full',
                          deptCount > 0 ? 'bg-green-400' : 'bg-slate-200',
                        )}
                      />
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
