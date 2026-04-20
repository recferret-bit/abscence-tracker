# Absence Tracker

A fullstack employee absence tracker (vacation, holidays, sick days) with
automatic monthly accrual and TZ-compliant vacation carryover. Implements the
specification in [`docs/TZ.md`](./docs/TZ.md).

- **Frontend** — React 19 + Vite + Tailwind v4 (`/frontend`)
- **Backend** — NestJS 10 + Prisma + PostgreSQL (`/backend`)
- **Auth** — JWT in HTTP-only cookie, multi-admin users with `ADMIN` / `VIEWER` roles
- **Balances** — never stored. Computed on the fly from `employee.startDate` +
  full absence history + global app settings.

## Repository layout

```
.
├── frontend/                # React SPA
│   ├── src/
│   ├── Dockerfile
│   └── nginx.conf
├── backend/                 # NestJS API
│   ├── src/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── test/
│   └── Dockerfile
├── docker-compose.yml
├── .env.example             # root env consumed by docker-compose
└── docs/
    └── TZ.md                # original technical specification
```

## Quick start (Docker)

```bash
cp .env.example .env         # tweak credentials if you wish
docker compose up --build
```

Then open **http://localhost:3000** and sign in with the seeded admin:

- Email: `admin@finharbor.com`
- Password: `admin`

The backend container runs `prisma migrate deploy` and re-seeds on every start
(idempotent — sample employees are only inserted on the first run when the DB is
empty).

To change the seeded admin credentials, edit `.env` (or pass `ADMIN_EMAIL` /
`ADMIN_PASSWORD` env vars) **before** the first `docker compose up`. Once the
admin row exists, change credentials via `PATCH /api/users/:id` instead.

## Local development

### Prerequisites

- Node.js 20+
- A running Postgres (you can use just the `db` service from compose:
  `docker compose up -d db`)

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:deploy        # apply migrations
npm run prisma:seed          # create admin + sample data
npm run start:dev
```

API is at `http://localhost:4000/api`. Run unit tests with `npm test`.

### Frontend

```bash
cd frontend
npm install
# Point the SPA at the local API
echo 'VITE_API_URL=http://localhost:4000/api' > .env
npm run dev
```

The Vite dev server runs on `http://localhost:3000`.

## Domain rules (per [docs/TZ.md](./docs/TZ.md))

- **Vacation** — `vacationQuota` days/year (default 20). Accrued monthly
  (`quota / 12` per full calendar month worked). Unused days carry into the next
  year and remain spendable until **June 30**; anything still unused after that
  is forfeited automatically.
- **Holidays** — `holidayQuota` days/year (default 17). Same monthly accrual.
  Per TZ REQ-04, unused holidays burn at year end and never carry over.
- **Sick** — unbounded; only the count is reported.
- Only working days (Mon–Fri) count for `used`. Weekend rows are ignored.

All of the above is computed deterministically by `BalanceService` and exposed
via `GET /api/employees/:id/balance?asOf=YYYY-MM-DD`. Unit tests live in
[`backend/test/balance.service.spec.ts`](backend/test/balance.service.spec.ts).

## CSV export

The Export button on the dashboard downloads only the rows currently visible to
the user — it respects the active department, type, and search filters as well
as the visible date window. The file is plain UTF-8 CSV (with a BOM for Excel)
named `absences_<dept>_<type>_<today>.csv`.

## API surface (high level)

| Method | Path                                | Auth   | Notes |
| ------ | ----------------------------------- | ------ | ----- |
| POST   | `/api/auth/login`                   | public | sets `access_token` cookie |
| POST   | `/api/auth/logout`                  | user   |  |
| GET    | `/api/auth/me`                      | user   |  |
| GET    | `/api/settings`                     | user   | global quotas + carryover deadline |
| PATCH  | `/api/settings`                     | admin  |  |
| GET    | `/api/users`                        | admin  |  |
| POST   | `/api/users`                        | admin  |  |
| PATCH  | `/api/users/me/prefs`               | user   | per-user UI prefs (free-form JSON) |
| PATCH  | `/api/users/:id`                    | admin  |  |
| DELETE | `/api/users/:id`                    | admin  |  |
| GET    | `/api/departments`                  | user   |  |
| POST   | `/api/departments`                  | admin  |  |
| DELETE | `/api/departments/:id`              | admin  | blocked if any employees attached |
| GET    | `/api/employees`                    | user   |  |
| POST   | `/api/employees`                    | admin  |  |
| PATCH  | `/api/employees/:id`                | admin  |  |
| DELETE | `/api/employees/:id`                | admin  |  |
| GET    | `/api/absences?from&to&type&...`    | user   |  |
| POST   | `/api/absences`                     | admin  |  |
| PATCH  | `/api/absences/:id`                 | admin  | only `type` |
| DELETE | `/api/absences/:id`                 | admin  |  |
| GET    | `/api/employees/:id/balance?asOf`   | user   | auto-computed balance |
