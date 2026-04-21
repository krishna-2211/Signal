# Signal
**AI-powered client intelligence for commercial banks**

---

## What it does

Signal runs a daily multi-agent pipeline across a commercial bank's entire client portfolio, analysing behavioural data to surface three types of early-warning signals: credit stress, churn risk, and upsell opportunity. Each morning, relationship managers open a prioritised intelligence brief — not a dashboard to interpret, but a concrete list of who needs a call today and why. Risk managers get a portfolio-wide view showing sector stress, severity distribution, and escalation queue across all clients and RMs.

---

## The problem

Sarah is a relationship manager at a commercial bank. She manages 25 business clients with no system telling her who needs attention today. Three things are happening silently in her portfolio right now:

- **CLT-005 · Nexus Technology Solutions** — payment delays have been drifting later by 4 days each month for the past quarter. Credit stress is building. Sarah doesn't know.
- **CLT-015 · Falcon Freight Services** — transaction volume is down 38% over 8 weeks and the client hasn't logged into online banking in 34 days. They're leaving. Sarah doesn't know.
- **CLT-022 · Velocity Fitness Studios** — revenue is up 29% YoY, they hold only 2 products, and their industry peer group is expanding headcount. Classic upsell signal. Sarah doesn't know.

Without Signal, Sarah finds out about the credit stress case when the loan goes 30 days past due. She finds out about the churn case when the client calls to close their account. She never finds out about the upsell case at all.

---

## How it works

```
SQLite (25 clients, 1,300 weeks of transactions)
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  1. DataIngestionAgent      — pulls 12w transactions,│
│                               payments, balances,    │
│                               logins, product usage  │
│                                                      │
│  2. ExternalSignalAgent     — fetches NewsAPI        │
│                               headlines + FRED macro │
│                               indicators per client  │
│                                                      │
│  3. SignalDetectionAgent    — LLM classifies signal  │
│                               type + severity from   │
│                               internal data first,   │
│                               external data second   │
│                                                      │
│  4. ImpactEstimationAgent   — estimates dollar impact│
│                               (revenue at risk,      │
│                               upsell opportunity)    │
│                                                      │
│  5. BriefGenerationAgent    — LLM writes plain-      │
│                               English brief +        │
│                               recommended action     │
│                                                      │
│  6. Orchestrator            — sequences agents per   │
│                               client, handles errors,│
│                               writes audit trail     │
└─────────────────────────────────────────────────────┘
        │
        ▼
  Daily intelligence brief (RM portal + Risk dashboard)
```

The pipeline runs sequentially per client. If the external signal agent fails (API quota, timeout), the pipeline continues with internal data only — the signal is not suppressed. Every agent step is logged to the audit table.

---

## Signal types

| Signal | Triggers | Action |
|---|---|---|
| **Credit Stress** | Payment timing worsening, avg days late > 5, balance down > 20%, volume down > 15% | Proactive relationship call, credit review |
| **Churn Risk** | No login > 20 days, declining login trend, volume down > 25%, balance down > 30% | Retention call, competitive response |
| **Upsell Opportunity** | Volume up > 20%, balance up > 30%, high login activity, fewer than 3 products held | Product conversation, cross-sell brief |

Severity is calibrated by data layer: internal signal alone → LOW/MEDIUM. Internal + FRED macro confirms → bumped one level. Internal + news headline confirms → bumped one level. Both external sources confirm → HIGH.

---

## Data architecture

**Primary — internal behavioural data (always available)**
Drives the signal decision. Transactions (12 weeks), payment history (days late, drift direction), balance snapshots (3-month trend), login frequency, product usage scores. A signal is fired on internal thresholds alone — external data cannot suppress it.

**Secondary — external signals (confidence boosters)**
- **NewsAPI** — industry-specific headlines fetched per client at pipeline time, used as supporting evidence
- **FRED** — Federal Reserve macroeconomic series matched to client industry, used to flag sector-wide headwinds

---

## Tech stack

| Layer | Stack |
|---|---|
| Backend | Python 3.11, FastAPI, SQLite |
| Agents | 6 sequential AI agents, fully LLM-agnostic |
| LLM | Ollama (local) · Gemini · OpenAI — swap via `LLM_PROVIDER` env var |
| Frontend | React 18, Vite, plain CSS with design tokens |
| Auth | JWT (HS256), bcrypt passwords, role-based access control |
| Data | 25 mock clients, 1,300 weeks of transaction history, 3 RMs |

---

## Demo credentials

| Name | Role | Email | Password |
|---|---|---|---|
| Sarah Mitchell | Relationship Manager | sarah.mitchell@signal.com | password123 |
| James Okafor | Relationship Manager | james.okafor@signal.com | password123 |
| Priya Nair | Relationship Manager | priya.nair@signal.com | password123 |
| Marcus Webb | Risk Manager | marcus.webb@signal.com | password123 |

RMs see their own portfolio only. Marcus sees all 25 clients, the risk dashboard, and the escalation queue.

---

## Setup

**1. Clone the repo**
```bash
git clone https://github.com/krishna-2211/signal.git
cd signal
```

**2. Create a virtual environment and install dependencies**
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**3. Configure environment variables**
```bash
cp .env.example .env
```
Edit `.env` and set at minimum:
```
LLM_PROVIDER=gemini          # or ollama, openai
GEMINI_API_KEY=your_key_here
NEWS_API_KEY=your_key_here   # optional — pipeline degrades gracefully
FRED_API_KEY=your_key_here   # optional — pipeline degrades gracefully
```

**4. Generate mock data**
```bash
python backend/data/generate_mock_data.py
```
Creates 25 clients, 3 relationship managers, and 1,300 weeks of transaction history in `backend/data/signal.db`.

**5. Start the backend**
```bash
python -m backend.main
```
API runs at `http://localhost:8000`. Swagger docs at `/docs`.

**6. Start the frontend**
```bash
cd frontend
npm install
npm run dev
```
UI runs at `http://localhost:5173`.

**7. Login and run the pipeline**

Navigate to `http://localhost:5173`, log in as Sarah Mitchell, and click **Run Pipeline**. The pipeline processes all 25 clients sequentially (~3 minutes). Today's Brief populates when it completes.

---

## Project structure

```
signal/
├── backend/
│   ├── agents/
│   │   ├── orchestrator.py           # sequences all agents per client
│   │   ├── data_ingestion_agent.py   # pulls client behavioural data
│   │   ├── external_signal_agent.py  # NewsAPI + FRED per client
│   │   ├── signal_detection_agent.py # LLM signal classification
│   │   ├── impact_estimation_agent.py# dollar impact calculation
│   │   └── brief_generation_agent.py # LLM brief + action writing
│   ├── routers/
│   │   ├── auth_router.py            # POST /login, GET /me
│   │   ├── clients.py                # client list + detail
│   │   ├── briefs.py                 # today's brief, latest brief
│   │   ├── dashboard.py              # risk dashboard endpoint
│   │   ├── pipeline.py               # POST /run trigger
│   │   └── audit.py                  # audit log
│   ├── database/
│   │   └── db.py                     # all SQL queries
│   ├── core/
│   │   └── llm_client.py             # Gemini / OpenAI / Ollama adapter
│   ├── auth.py                       # JWT + bcrypt, hardcoded users
│   ├── config.py                     # env-var settings
│   └── main.py                       # FastAPI app, router registration
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── rm/
│       │   │   ├── TodaysBrief.jsx   # RM daily brief + action queue
│       │   │   ├── MyPortfolio.jsx   # full client list with signals
│       │   │   └── ClientDetail.jsx  # per-client deep dive
│       │   ├── risk/
│       │   │   ├── RiskDashboard.jsx # portfolio-wide signal view
│       │   │   └── EscalationQueue.jsx
│       │   └── AuditLog.jsx          # full pipeline audit trail
│       ├── context/AuthContext.jsx   # JWT auth state + session restore
│       ├── components/Sidebar.jsx    # role-aware navigation
│       ├── services/api.js           # fetch wrapper with auth headers
│       └── utils/signalColors.js     # signal type → colour mapping
├── requirements.txt
└── .env.example
```

---

## Architecture decisions

- **LLM-agnostic by design.** `llm_client.py` abstracts over Gemini, OpenAI, and Ollama behind a single `complete(system, user)` interface. Switch providers by changing one env var — no agent code changes.

- **Internal data drives the decision; external data adjusts confidence.** The signal detection prompt is structured so internal behavioural thresholds fire the signal, and FRED/news data can only raise severity — never suppress a signal that internal data already justifies.

- **Brief table as the authoritative signal source.** The raw `signals` table reflects the latest pipeline run and may reset values to `none`. The `briefs` table retains the last actionable detection. All three portals (Today's Brief, My Portfolio, Risk Dashboard) read signal type and severity from briefs, not the signals table.

- **Sequential orchestration with graceful degradation.** Each agent runs in sequence and writes to the audit log. If an external API call fails, the agent returns an empty result and the pipeline continues. A failed external signal agent produces a weaker signal (lower severity), not a missing one.

- **Dual-portal role separation.** RMs and Risk Managers see the same underlying data but through different lenses: RMs get a prioritised action queue scoped to their book; Risk Managers get portfolio-wide analytics, sector stress detection, and an escalation queue across all RMs.
