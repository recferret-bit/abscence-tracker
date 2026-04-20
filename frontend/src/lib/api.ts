import type {
  AbsenceRecord,
  AbsenceType,
  AppConfig,
  AuthUser,
  BalanceResponse,
  Department,
  Employee,
} from '../types';

const RAW_BASE = (import.meta as { env?: { VITE_API_URL?: string } }).env
  ?.VITE_API_URL?.trim();
const BASE_URL = RAW_BASE && RAW_BASE.length > 0 ? RAW_BASE : '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : res.statusText || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ user: AuthUser; token: string }>('POST', '/auth/login', { email, password }),
  logout: () => request<void>('POST', '/auth/logout'),
  me: () => request<AuthUser>('GET', '/auth/me'),

  // Settings
  getSettings: () => request<AppConfig>('GET', '/settings'),
  updateSettings: (patch: Partial<AppConfig>) =>
    request<AppConfig>('PATCH', '/settings', patch),

  // Departments
  listDepartments: () => request<Department[]>('GET', '/departments'),
  createDepartment: (name: string) =>
    request<Department>('POST', '/departments', { name }),
  deleteDepartment: (id: string) =>
    request<void>('DELETE', `/departments/${id}`),

  // Employees
  listEmployees: () => request<Employee[]>('GET', '/employees'),
  createEmployee: (data: {
    name: string;
    departmentId: string;
    manager: string;
    startDate: string;
  }) => request<Employee>('POST', '/employees', data),
  updateEmployee: (id: string, data: Partial<Employee> & { departmentId?: string }) =>
    request<Employee>('PATCH', `/employees/${id}`, data),
  deleteEmployee: (id: string) => request<void>('DELETE', `/employees/${id}`),

  // Absences
  listAbsences: (params?: { from?: string; to?: string; type?: AbsenceType; employeeId?: string; departmentId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.type) qs.set('type', params.type);
    if (params?.employeeId) qs.set('employeeId', params.employeeId);
    if (params?.departmentId) qs.set('departmentId', params.departmentId);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<AbsenceRecord[]>('GET', `/absences${suffix}`);
  },
  createAbsence: (data: { employeeId: string; date: string; type: AbsenceType }) =>
    request<AbsenceRecord>('POST', '/absences', data),
  updateAbsence: (id: string, type: AbsenceType) =>
    request<AbsenceRecord>('PATCH', `/absences/${id}`, { type }),
  deleteAbsence: (id: string) => request<void>('DELETE', `/absences/${id}`),

  // Balance
  getBalance: (employeeId: string, asOf?: string) => {
    const suffix = asOf ? `?asOf=${asOf}` : '';
    return request<BalanceResponse>('GET', `/employees/${employeeId}/balance${suffix}`);
  },
};
