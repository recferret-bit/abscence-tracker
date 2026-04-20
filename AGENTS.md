# Absence Tracker — Agent Guide

> Authoritative working notes for any AI agent (Claude, Cursor, Codex, etc.)
> contributing to this repository. Keep this file, `CLAUDE.md` and
> `.cursor/rules/project.mdc` in lock‑step — they MUST stay byte‑identical
> in body. The original product spec lives in [`docs/TZ.md`](./docs/TZ.md).

---

## 1. What this product is

A small but production‑shaped fullstack app that replaces the legacy
"График отпусков FinHarbor" Google Sheet. It tracks three categories of
absence per employee on a single unified calendar:

| Code       | Meaning   | UI colour |
| ---------- | --------- | --------- |
| `VACATION` | Vacation  | Green     |
| `HOLIDAY`  | Holiday   | Blue      |
| `SICK`     | Sick day  | Red       |

The app is consumed by HR / managers. There is **no public surface**;
every route requires an authenticated session.

## 2. Repository layout

```
.
├── frontend/                React 19 + Vite SPA, Nginx in prod
│   ├── src/
│   │   ├── pages/           DashboardPage, LoginPage, SettingsPage
│   │   ├── lib/             api.ts, auth-context.tsx, data-context.tsx, csv-export.ts
│   │   ├── App.tsx          Router + providers + ProtectedRoute
│   │   ├── constants.ts     UI colour / label maps only
│   │   ├── types.ts         Shared TS types mirroring backend DTOs
│   │   └── index.css        Tailwind v4 entry
│   ├── nginx.conf           SPA fallback + /api → backend proxy
│   └── Dockerfile           multi‑stage (build → nginx)
├── backend/                 NestJS 10 API (Prisma + Postgres)
│   ├── prisma/
│   │   ├── schema.prisma    User, AppSettings, Department, Employee, Absence
│   │   ├── migrations/
│   │   └── seed.ts          idempotent seed (admin, settings, departments)
│   ├── src/
│   │   ├── auth/            login/logout/me, JwtGuard, RolesGuard, @Public, @Roles
│   │   ├── users/           admin CRUD + /users/me/prefs
│   │   ├── settings/        singleton GET/PATCH /settings
│   │   ├── departments/     CRUD; delete blocked while employees attached
│   │   ├── employees/       CRUD with Department FK
│   │   ├── absences/        list + upsert (toggle) + delete
│   │   ├── balance/         derived BalanceService + GET /employees/:id/balance
│   │   ├── prisma/          PrismaService (singleton)
│   │   ├── app.module.ts    wires modules + global guards
│   │   └── main.ts          helmet, cookie-parser, ValidationPipe, /api prefix
│   ├── test/                jest specs (BalanceService is the priority target)
│   └── Dockerfile           multi‑stage (build → runtime; runs migrate+seed)
├── docs/
│   └── TZ.md                original product specification (Russian)
├── docker-compose.yml       db (postgres) + backend + frontend
├── .env.example             root env consumed by docker‑compose
├── README.md                user‑facing setup & quick start
├── AGENTS.md                this file
├── CLAUDE.md                identical copy of this file
└── .cursor/
    └── rules/
        └── project.mdc      identical copy of this file (with mdc frontmatter)
```

## 3. Domain rules — distilled from `docs/TZ.md`

These are the **load‑bearing** rules. Every change to balance / accrual
logic MUST be cross‑checked against this section AND `docs/TZ.md`.

### 3.1 Categories
- `VACATION`, `HOLIDAY`, `SICK` are the only valid `AbsenceType` values
  (REQ‑02, REQ‑09, AC‑08). DTOs and Prisma enums must mirror this.
- One unified calendar — never split categories across pages or routes
  (REQ‑01, AC‑01).

### 3.2 Working‑day semantics
- Only Mon–Fri count toward `used` for any category (REQ‑03, REQ‑04,
  REQ‑06, AC‑03).
- Saturdays and Sundays are visually muted in the grid and **never**
  decrement balance even if a record exists.
- Public holidays are NOT auto‑detected — they are entered manually as
  `HOLIDAY` absences (TZ §6).

### 3.3 Vacation (`VACATION`) — REQ‑03 / AC‑04
- Default annual quota: **20 working days** (configurable via
  `AppSettings.vacationQuota`).
- **Monthly accrual**: an employee earns `quota / 12` per fully‑worked
  calendar month, prorated from `Employee.startDate`. The first partial
  month does NOT accrue.
- **Carryover**: unused vacation days roll into the next year.
- **June 30 forfeiture**: carried‑over days are usable only until
  `June 30` of the following year. After that date, any remaining
  carry‑in is forfeited (the carry‑in bucket goes to 0; the current‑year
  accrual is untouched).
- `BalanceService.computeBalance` is the single source of truth; it is
  **pure** and derived on every request — never persisted.

### 3.4 Holiday (`HOLIDAY`) — REQ‑04 / AC‑05
- Default annual quota: **17 working days** (configurable via
  `AppSettings.holidayQuota`).
- Monthly accrual identical to vacation.
- **No carryover.** Unused holiday days BURN at year end. Do not write
  code that survives a holiday balance into the next calendar year.

### 3.5 Sick (`SICK`) — REQ‑05 / AC‑06
- **Unlimited.** Track usage only; never block an entry on a quota.
- The `sick` block in the balance response only reports `used` — it has
  no `quota`, `accrued`, `balance` or `forfeited` fields.

### 3.6 Reported metrics — REQ‑07 / AC‑07
For every employee + category the API returns at minimum:
`accruedToDate`, `accruedYearEnd`, `used`, `carryIn`, `forfeited`,
`balanceToday`, `balanceYearEnd`. The dashboard shows
"current balance" and "year‑end projection" side by side.

### 3.7 Filtering & navigation — REQ‑10 / REQ‑11
- Dashboard supports filtering by employee, department, absence type and
  date range; the Export (CSV) button MUST honour the active filters.
- The grid opens scrolled to the current week; past weeks are reachable
  by horizontal scroll (REQ‑11 / AC‑10).

### 3.8 Toggle semantics
Clicking a cell with a chosen type:
- empty → create absence of that type;
- same type → delete absence (toggle off);
- different type → update absence to the new type.
This is implemented by the backend `POST /absences` upsert; the
frontend never deletes locally without round‑tripping.

### 3.9 Departments
Default departments (REQ‑10): Backend, Frontend, Flutter, DevOps, QA,
Technical Support, Analysis, Design, Management, HR, Marketing.
They are seeded but fully editable. Deleting a department with attached
employees MUST return HTTP 409.

## 4. Frontend conventions (`frontend/`)

- **Stack**: React 19 + Vite, Tailwind v4, `date-fns`, `motion/react`,
  `lucide-react`, React Router v7.
- **No localStorage auth.** Auth lives in HTTP‑only cookies; state goes
  through `lib/auth-context.tsx` (`useAuth()`).
- **No direct `fetch`.** All HTTP goes through `lib/api.ts`. Add a new
  endpoint there, then expose it via `useData()` if it touches shared
  state.
- **Data flow**: `DataProvider` owns `employees`, `departments`,
  `absences`, `config`; pages call its mutator methods which optimistically
  update local state and re‑hydrate on error.
- **Types**: keep `src/types.ts` aligned with backend DTOs / Prisma enums.
- **Styling**: Tailwind utility classes inline; the canonical category
  palette lives in `src/constants.ts` — do not duplicate colours.
- **Dates**: format via `date-fns`. Always pass ISO `YYYY-MM-DD` to the
  API; never send timezone‑sensitive strings.
- **Animations**: prefer `motion/react` (`<motion.div>`) for entrance /
  layout transitions; keep durations short (~150–250ms).
- **Icons**: `lucide-react` only.
- **Routing**: protected routes wrap children with `<DataProvider>` so
  unauth pages never trigger data fetches.
- **CSV export**: `lib/csv-export.ts` (`toCsv`, `downloadCsv`) is the
  only allowed CSV path. It writes a UTF‑8 BOM for Excel compatibility.

## 5. Backend conventions (`backend/`)

- **Stack**: NestJS 10, Prisma, Postgres 16, JWT (cookie), Passport,
  `class-validator`, `helmet`, `cookie-parser`.
- **HTTP shape**: every route is namespaced under `/api`. Use kebab/REST
  resource paths. Errors are standard Nest exceptions
  (`NotFoundException`, `ConflictException`, …).
- **Auth**:
  - Global `JwtAuthGuard` + `RolesGuard` — opt OUT with `@Public()`,
    restrict with `@Roles(Role.ADMIN)`.
  - JWT is set as an HTTP‑only cookie (`access_token`); CORS is
    configured with `credentials: true` and a single allowed origin
    (`CORS_ORIGIN`).
- **Validation**: every controller input goes through a DTO with
  `class-validator`. Global `ValidationPipe({ whitelist: true,
  transform: true, forbidNonWhitelisted: true })` is enabled in
  `main.ts`.
- **Database**:
  - Prisma is the only DB client (`PrismaService`).
  - `AppSettings` is a singleton with id `1` — always upsert, never
    insert blindly.
  - `Absence` has a unique composite key on `(employeeId, date)` — rely
    on it for upsert semantics.
  - Dates use `@db.Date` (no time component).
- **Migrations**: changes to `schema.prisma` MUST be accompanied by a
  new Prisma migration (`npx prisma migrate dev --name …`). Never edit
  an applied migration after the fact.
- **Seed**: `prisma/seed.ts` is idempotent. Add new defaults via
  `upsert`. Sample employees/absences are inserted only when the
  `Employee` table is empty so production data is never overwritten.
- **Balance logic**: `BalanceService.computeBalance` is the only place
  that performs accrual / carryover / forfeiture maths. Keep it pure
  (no Prisma calls) — the controller fetches inputs and passes them in.
- **Tests**: `backend/test/balance.service.spec.ts` is the safety net
  for §3.3–3.5. Update it whenever rules change.

## 6. Code style — both sides

- TypeScript `strict` is on; no `any` unless justified with a comment.
- Prefer `const`, immutable updates, early returns.
- Filenames: `kebab-case.ts` for libs/utils, `PascalCase.tsx` for React
  components.
- **Do not write narrating comments** (`// loop over rows`). Comments
  explain *why*, never *what*.
- Keep functions small; pull pure helpers out of components / services.
- Reuse existing patterns before inventing new ones — context providers,
  DTO shapes, Prisma upserts, etc.

## 7. How to add things — recipes

**New API endpoint**
1. Add/extend a DTO under the relevant module (`*.dto.ts`).
2. Add a controller method (with `@Roles` if admin‑only).
3. Add the service method; keep DB access in the service.
4. Add a typed wrapper in `frontend/src/lib/api.ts`.
5. If it mutates shared state, expose it via `data-context.tsx`.

**New Prisma model / column**
1. Edit `backend/prisma/schema.prisma`.
2. `npx prisma migrate dev --name <change>` from `backend/`.
3. Update `seed.ts` if defaults are needed.
4. Regenerate types are automatic; restart Nest dev server.

**New page / route**
1. Add the page under `frontend/src/pages/`.
2. Register it in `App.tsx` inside the `<ProtectedRoute>` tree.
3. Pull data via `useData()` / `useAuth()`; do not fetch directly.

## 8. Local dev / Docker

- Full stack: `docker compose up --build` from repo root. Migrations
  and seed run automatically inside the backend container's `CMD`.
- Frontend → http://localhost:5173 (or as exposed by compose).
- Backend → http://localhost:4000/api (proxied to `/api` by Nginx in
  prod, by Vite proxy in dev — see `vite.config.ts`).
- DB: Postgres 16 with healthcheck; the backend `depends_on` it with
  `condition: service_healthy`.
- Default credentials and ports live in `.env.example` (root, frontend,
  backend). Never commit real `.env` files.

## 9. Hard rules — DO and DON'T

DO
- Treat `docs/TZ.md` as the product spec. If it disagrees with code,
  flag it; do not silently diverge.
- Keep `BalanceService` pure and exhaustively tested.
- Keep the three agent files (`AGENTS.md`, `CLAUDE.md`,
  `.cursor/rules/project.mdc`) byte‑identical in body when editing.
- Run `npm run lint` / `npm test` in the touched workspace before
  declaring done.

DON'T
- Don't store derived balances in the DB.
- Don't carry over `HOLIDAY` days — they burn at year end.
- Don't bypass `BalanceService` for "quick" calculations on either side.
- Don't read or write `localStorage` for auth.
- Don't add CSV libraries — `csv-export.ts` is enough.
- Don't introduce new state managers (Redux, Zustand, …); the two
  contexts cover current scope.
- Don't downgrade Tailwind v4 syntax to v3.

## 10. When in doubt

1. Re‑read `docs/TZ.md` (sections REQ‑* and AC‑*).
2. Re‑read this file's §3 (domain rules).
3. Look for an existing pattern in the matching module before creating
   a new one.
4. If a requirement is missing or ambiguous, surface the question to the
   user instead of guessing — balance maths in particular must not be
   improvised.
