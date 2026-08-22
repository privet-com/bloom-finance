# Bloom Finance — Full-Stack V2 🌸

Bloom is a personal finance tracker where your monthly budget becomes a living flower. Stay on pace and it blooms; overspend and it wilts.

## What is real in V2

- Register + login
- Passwords hashed with bcrypt
- JWT authentication
- PostgreSQL persistence
- Multiple financial accounts
- Real transaction create/read/update/delete API
- Category budget create/update/delete API
- Flower state driven by saved transactions + saved budgets
- Savings goals
- Subscription tracking
- CSV statement import
- Algorithmic financial insights
- First anomaly/fraud-warning engine
- User-level database authorization checks

## 1. Start PostgreSQL

### Easiest: Docker Desktop

From the project folder:

```bash
docker compose up -d
```

This creates a PostgreSQL database at:

`postgresql://bloom:bloom@localhost:5432/bloom`

You can also use your own PostgreSQL installation and change `DATABASE_URL`.

## 2. Configure environment

Copy `.env.example` to `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Change `JWT_SECRET` to a long random value before deployment.

## 3. Install + run

```bash
npm install
npm run dev
```

Open the Vite URL (normally http://localhost:5173).
The API runs at http://localhost:4000.

The server automatically creates all database tables the first time it starts.

## CSV import format

```csv
merchant,amount,category,date,notes
Starbucks,-24,Coffee,2026-08-22,Iced latte
Salary,8500,Income,2026-08-20,August salary
ADNOC,-126,Fuel,2026-08-21,Petrol
```

`merchant` and `amount` are required. Expenses should be negative; income positive.

## Main database tables

- users
- accounts
- transactions
- budgets
- goals
- subscriptions

## Security currently included

- bcrypt password hashing (cost 12)
- expiring JWT sessions
- authenticated API routes
- ownership filtering on database queries
- PostgreSQL parameterized queries
- upload size limits
- transaction anomaly scoring

## Next production upgrades

- Refresh tokens or secure HTTP-only cookie sessions
- Email verification / password reset
- TOTP MFA
- login audit log and suspicious-login detection
- proper CSV parser for quoted commas / bank-specific adapters
- XLSX import
- automatic recurring-payment detection
- richer forecasting
- LLM-powered financial brief (with explicit opt-in)
- server-side validation library
- tests
- deployment configuration
