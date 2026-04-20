import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

import { PrismaClient, Role, AbsenceType } from './generated/client/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run prisma/seed.ts');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});

const DEPARTMENTS = [
  'Backend',
  'Frontend',
  'Flutter',
  'DevOps',
  'QA',
  'Technical Support',
  'Analysis',
  'Design',
  'Management',
  'HR',
  'Marketing',
];

const SAMPLE_EMPLOYEES: Array<{
  name: string;
  department: string;
  manager: string;
  startDate: string;
}> = [
  { name: 'Alice Johnson', department: 'Design', manager: 'Sarah Smith', startDate: '2022-03-15' },
  { name: 'Bob Wilson', department: 'Frontend', manager: 'John Doe', startDate: '2023-01-10' },
  { name: 'Charlie Brown', department: 'Backend', manager: 'John Doe', startDate: '2021-11-20' },
  { name: 'Diana Prince', department: 'Management', manager: 'Sarah Smith', startDate: '2020-05-01' },
  { name: 'Edward Norton', department: 'DevOps', manager: 'Michael Scott', startDate: '2024-02-14' },
];

const SAMPLE_ABSENCES: Array<{
  employee: string;
  date: string;
  type: AbsenceType;
}> = [
  { employee: 'Alice Johnson', date: '2026-04-10', type: 'VACATION' },
  { employee: 'Alice Johnson', date: '2026-04-13', type: 'VACATION' },
  { employee: 'Bob Wilson', date: '2026-04-15', type: 'HOLIDAY' },
  { employee: 'Charlie Brown', date: '2026-04-16', type: 'SICK' },
  { employee: 'Edward Norton', date: '2026-04-20', type: 'VACATION' },
];

async function main(): Promise<void> {
  // 1. App settings (singleton)
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, vacationQuota: 20, holidayQuota: 17, carryoverDeadline: '06-30' },
  });

  // 2. Admin user
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@finharbor.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin';
  const adminName = process.env.ADMIN_NAME ?? 'Admin User';
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, name: adminName, role: Role.ADMIN },
    create: {
      email: adminEmail,
      passwordHash,
      name: adminName,
      role: Role.ADMIN,
    },
  });

  // 3. Departments
  for (const name of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // 4. Sample employees (only inserted on first run when DB is empty)
  const existingEmployees = await prisma.employee.count();
  if (existingEmployees === 0) {
    for (const e of SAMPLE_EMPLOYEES) {
      const dept = await prisma.department.findUnique({ where: { name: e.department } });
      if (!dept) continue;
      await prisma.employee.create({
        data: {
          name: e.name,
          departmentId: dept.id,
          manager: e.manager,
          startDate: new Date(e.startDate + 'T00:00:00.000Z'),
        },
      });
    }

    for (const a of SAMPLE_ABSENCES) {
      const emp = await prisma.employee.findFirst({ where: { name: a.employee } });
      if (!emp) continue;
      await prisma.absence.create({
        data: {
          employeeId: emp.id,
          date: new Date(a.date + 'T00:00:00.000Z'),
          type: a.type,
        },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log('Seed completed.');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
