import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AbsenceRecord,
  AbsenceType,
  AppConfig,
  Department,
  Employee,
} from '../types';
import { assertQuotaWithinLimits } from './balance';
import { api } from './api';

interface DataState {
  loading: boolean;
  error: string | null;
  employees: Employee[];
  departments: Department[];
  absences: AbsenceRecord[];
  config: AppConfig;
}

interface DataContextValue extends DataState {
  refresh: () => Promise<void>;

  createEmployee: (
    e: Omit<Employee, 'id' | 'department' | 'vacationQuota' | 'holidayQuota'>,
  ) => Promise<void>;
  updateEmployee: (id: string, patch: Partial<Employee> & { departmentId?: string }) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;

  createDepartment: (name: string) => Promise<void>;
  deleteDepartment: (id: string) => Promise<void>;

  upsertAbsence: (employeeId: string, date: string, type: AbsenceType) => Promise<void>;
  deleteAbsence: (id: string) => Promise<void>;

  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

const DEFAULT_CONFIG: AppConfig = {
  vacationQuota: 20,
  holidayQuota: 17,
  carryoverDeadline: '06-30',
};

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DataState>({
    loading: true,
    error: null,
    employees: [],
    departments: [],
    absences: [],
    config: DEFAULT_CONFIG,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [config, departments, employees, absences] = await Promise.all([
        api.getSettings(),
        api.listDepartments(),
        api.listEmployees(),
        api.listAbsences(),
      ]);
      setState({
        loading: false,
        error: null,
        config,
        departments,
        employees,
        absences,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createEmployee = useCallback<DataContextValue['createEmployee']>(async (e) => {
    const created = await api.createEmployee({
      name: e.name,
      departmentId: e.departmentId,
      manager: e.manager,
      startDate: e.startDate,
    });
    setState((s) => ({ ...s, employees: [...s.employees, created] }));
  }, []);

  const updateEmployee = useCallback<DataContextValue['updateEmployee']>(async (id, patch) => {
    const updated = await api.updateEmployee(id, patch);
    setState((s) => ({
      ...s,
      employees: s.employees.map((e) => (e.id === id ? updated : e)),
    }));
  }, []);

  const deleteEmployee = useCallback<DataContextValue['deleteEmployee']>(async (id) => {
    await api.deleteEmployee(id);
    setState((s) => ({
      ...s,
      employees: s.employees.filter((e) => e.id !== id),
      absences: s.absences.filter((a) => a.employeeId !== id),
    }));
  }, []);

  const createDepartment = useCallback<DataContextValue['createDepartment']>(async (name) => {
    const created = await api.createDepartment(name);
    setState((s) => ({ ...s, departments: [...s.departments, created] }));
  }, []);

  const deleteDepartment = useCallback<DataContextValue['deleteDepartment']>(async (id) => {
    await api.deleteDepartment(id);
    setState((s) => ({
      ...s,
      departments: s.departments.filter((d) => d.id !== id),
    }));
  }, []);

  const upsertAbsence = useCallback<DataContextValue['upsertAbsence']>(
    async (employeeId, date, type) => {
      const existing = state.absences.find(
        (a) => a.employeeId === employeeId && a.date === date,
      );

      let prospective: AbsenceRecord[];
      if (existing) {
        if (existing.type === type) {
          prospective = state.absences.filter((a) => a.id !== existing.id);
        } else {
          prospective = state.absences.map((a) =>
            a.id === existing.id ? { ...a, type } : a,
          );
        }
      } else {
        prospective = [
          ...state.absences,
          { id: '__pending__', employeeId, date, type },
        ];
      }

      if (type !== 'SICK') {
        const employee = state.employees.find((e) => e.id === employeeId);
        if (employee) {
          const empProspective = prospective
            .filter((a) => a.employeeId === employeeId)
            .map((a) => ({
              date: new Date(a.date + 'T00:00:00.000Z'),
              type: a.type,
            }));
          assertQuotaWithinLimits({
            startDate: new Date(employee.startDate + 'T00:00:00.000Z'),
            absencesForEmployee: empProspective,
            affectedDates: [new Date(date + 'T00:00:00.000Z')],
            vacationQuota: employee.vacationQuota ?? state.config.vacationQuota,
            holidayQuota: employee.holidayQuota ?? state.config.holidayQuota,
            carryoverDeadline: state.config.carryoverDeadline,
          });
        }
      }

      if (existing) {
        if (existing.type === type) {
          await api.deleteAbsence(existing.id);
          setState((s) => ({
            ...s,
            absences: s.absences.filter((a) => a.id !== existing.id),
          }));
        } else {
          const updated = await api.updateAbsence(existing.id, type);
          setState((s) => ({
            ...s,
            absences: s.absences.map((a) => (a.id === existing.id ? updated : a)),
          }));
        }
      } else {
        const created = await api.createAbsence({ employeeId, date, type });
        setState((s) => ({ ...s, absences: [...s.absences, created] }));
      }
    },
    [state.absences, state.employees, state.config],
  );

  const deleteAbsence = useCallback<DataContextValue['deleteAbsence']>(async (id) => {
    await api.deleteAbsence(id);
    setState((s) => ({ ...s, absences: s.absences.filter((a) => a.id !== id) }));
  }, []);

  const updateConfig = useCallback<DataContextValue['updateConfig']>(async (patch) => {
    const next = await api.updateSettings(patch);
    setState((s) => ({ ...s, config: next }));
  }, []);

  const value = useMemo<DataContextValue>(
    () => ({
      ...state,
      refresh,
      createEmployee,
      updateEmployee,
      deleteEmployee,
      createDepartment,
      deleteDepartment,
      upsertAbsence,
      deleteAbsence,
      updateConfig,
    }),
    [
      state,
      refresh,
      createEmployee,
      updateEmployee,
      deleteEmployee,
      createDepartment,
      deleteDepartment,
      upsertAbsence,
      deleteAbsence,
      updateConfig,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
