# ProxyPilot — ERP edition

> One leave request in. HOD approves. Class covered — no phone calls. **Now inside your school's ERP.**

This is the **ERP edition** of [ProxyPilot](https://github.com/krishnachampreddy-lgtm/proxypilot): the same app, plus a connection that lets a school use ProxyPilot as an extension of the ERP it already has (Teachmint, Entab CampusCare, Fedena, MyClassboard, an in-house system…). The original app is kept unchanged in its own repository.

## What the ERP connection adds

```
            teachers · students · weekly timetable · leaves
  School ERP  ─────────────────────────────────────────────▶  ProxyPilot
             ◀─────────────────────────────────────────────
            leave.approved · leave.declined · cover.assigned · cover.passed · cover.failed
```

- **ERP API** (`/api/v1`) — the ERP sends teachers, students, the weekly timetable and leaves, with an API key the HOD creates.
- **Leaves from the ERP** — already approved there? Cover starts at once. Not yet? It waits for the HOD in ProxyPilot.
- **Signed webhooks** — every leave decision and cover change goes back to the ERP, HMAC-SHA256 signed, with retries.
- **Get latest** — or ProxyPilot reads the staff and timetable from the ERP's own API.
- **School ERP page** for the HOD — connect, create keys, sync, and an activity log of every message in and out.
- **Demo School ERP** at `/demo-erp` — a stand-in ERP to show the whole thing working without a partner's API access. One click: *School ERP → Try with a demo school*.

Guide for ERP developers: **[docs/ERP-API.md](docs/ERP-API.md)**.

## Deploy (Render + a free Neon database)

1. **Database:** create a free Postgres at [neon.com](https://neon.com) and copy its connection string (`postgresql://…`).
2. **Render:** New → Blueprint → pick this repo (it reads `render.yaml`). Paste the Neon string as `DATABASE_URL` when asked; add `GEMINI_API_KEY` / email keys if you use them.
3. Open the site, log in as the HOD (`hod@college.edu` / `demo123`), go to **School ERP → Try with a demo school**.

Each ProxyPilot site serves one school, so schools' data never mix.

---

## The problem

When a teacher goes on leave, the HOD spends 30–60 minutes every morning on WhatsApp and phone calls finding a free colleague for each "proxy" lecture. Leave approval is informal, the same willing teachers get overloaded, classes go uncovered, and nothing is recorded for the monthly report.

## The solution

ProxyPilot turns that whole chain into one automated workflow inside the app:

1. **Teacher applies for leave** — picks one date or **several days** (tap first and last day; Sundays and days without classes are skipped) on the calendar (or types it in plain words, e.g. *"Down with fever, can't come tomorrow"*) and chooses **Full day**, **Morning (P1–P4)**, **Afternoon (P5–P6)** or **specific periods**. The app shows exactly which classes will need cover.
2. **Leave balance** — every teacher gets 12 leaves a year (full day = 1, session/periods = ½). The balance is shown before applying, and a request that exceeds it is blocked.
3. **HOD approves or declines** — a multi-day leave arrives as one request. Rahul Attuluri (HOD) sees each request with the leave type, affected classes and the teacher's remaining balance. Declining requires a reason, which the teacher sees.
4. **Teacher can cancel** a request while it is still waiting for the HOD.
5. **Substitutes are found automatically** — teachers of the **same subject** are asked first; if none of them can take the class, it goes to free teachers of **other subjects** as backup. Within each group they are ranked fairly: knows the class (+20), fewer proxies this month (fairness), lighter load that day.
6. **Requests appear in the app** (no email spam) — the top teacher gets a request with a handover note. **Accept** assigns the class; **Decline** (or the HOD's *No reply → next*) passes it to the next best teacher.
7. **No one at all available → that day's leave is declined automatically**, with the reason shown to the teacher, so a class is never silently left empty.
8. **Students** see the substitute on their timetable.
9. **HOD dashboard** — coverage stats, proxy-load fairness chart, weekly note, and a **monthly report download** (CSV that opens in Excel: date, teacher, leave type, reason, HOD decision, period, class, subject, substitute, cover status, plus a summary).

**Also included**

- **No reply? It moves on by itself** — a cover request nobody answers within 15 minutes (5 if the class starts within the hour) passes to the next best teacher automatically. Teachers see a live countdown on each request. Set `REPLY_MINUTES` to change the window.
- **Live updates** — every screen updates the moment a leave is applied, approved or a class is covered (Server-Sent Events, with a small toast for each change). No refreshing.
- **Today on campus (HOD)** — the 3D school at the real time of day, with every classroom that needs cover today lit up on the building: green covered, yellow waiting for a reply, red not covered. Tap a class to fly to its room.
- **Insights (HOD)** — share of classes covered, median time to find cover, same-subject cover rate, a fairness score for proxy load, requests passed on, classes covered over six months, and which weekdays teachers are away most.
- **Add to calendar** — teachers download their cover lectures as an `.ics` file with a 10-minute reminder (Google Calendar, Outlook, phone).

- **"I'm sick today"** — one tap applies a full-day leave for today, marked *urgent* and shown first to the HOD.
- **Notification bell** — new cover requests, HOD decisions, "your class is covered" and student timetable changes, with an unread count.
- **Teacher summary** — leaves left, leaves taken, proxies taken this year/month, and classes colleagues covered.
- **Install as an app** — a Progressive Web App: "Install app" on Android/desktop, Add to Home Screen on iPhone.
- **Mobile-friendly** — every screen works on phones.
- **Home page** — explains the product with a one-tap demo.

**Subjects:** English, DBMS, Python, DSA, Aptitude.

## Login

- **Email OTP** — enter name + Gmail, receive a 6-digit code, done. No passwords.
- The device remembers you: next time just tap your name.
- New teachers pick their subjects on first login and get a starter timetable so they can try everything immediately.
- One-click demo accounts on the login page.

## Tech stack

| Layer | Tech |
| --- | --- |
| Frontend | React 19, Vite, React Router, Tailwind CSS v4, three.js (interactive background), Axios |
| Backend | Node.js, Express 5, JWT, Zod validation |
| Database | PostgreSQL (migrations applied automatically on start) |
| Email | Brevo HTTP API for OTP codes |
| Text understanding | Google Gemini (optional) with a rule-based fallback |
| Hosting | Render web service via `render.yaml`, free Neon PostgreSQL |
| ERP connection | REST API with API keys, HMAC-signed webhooks with retries, AES-256-GCM for stored secrets |

## Project structure

```
proxypilot-erp/
├── render.yaml                    Render blueprint (web service; database = Neon)
├── docs/ERP-API.md                guide for the ERP's developers
├── netlify/database/migrations/   SQL schema (applied automatically)
├── scripts/local-db.mjs           run locally with a throwaway Postgres
├── server/src/
│   ├── app.js / index.js          Express app + static frontend
│   ├── db.js                      PostgreSQL queries
│   ├── routes/                    auth, leaves, proxies, hod, student,
│   │                              erpApi (/api/v1, for the ERP), erpAdmin (HOD's School ERP page)
│   ├── services/                  matching (ranking), cover (after approval), decide,
│   │                              erp (keys, webhooks, sync), leaveBalance, email, dates
│   ├── demoErp/                   the Demo School ERP (/demo-erp) used to show the connection
│   └── seedData.js                demo teachers, timetable, history, sample leave
└── client/src/
    ├── pages/                     Login, Welcome, Faculty, Hod, Erp, Student
    └── components/                Layout, LeaveCalendar, AmbientScene, ui
```

## Run locally

Needs Node.js 20.12+.

```bash
npm install
npm run build                    # builds the React app
EMAIL_DEV_LOG=1 npm run dev:local   # http://localhost:5000 with a throwaway Postgres
```

With `EMAIL_DEV_LOG=1`, OTP codes are printed in the terminal instead of emailed. To use your own database and keys, copy `.env.example` to `.env`, fill it in and run `npm run dev:api`.

## Demo accounts (password: `demo123`)

| Who | Email | Subjects / use |
| --- | --- | --- |
| Dr. Anita Mehta | mehta@college.edu | DBMS, Python — apply for leave |
| Prof. Ravi Rao | rao@college.edu | DBMS, DSA — has a sample leave waiting for the HOD |
| Prof. Farhan Ali | ali@college.edu | Python, DSA — receive / accept requests |
| Dr. Priya Das | das@college.edu | DBMS, Aptitude |
| Rahul Attuluri | hod@college.edu | HOD dashboard |
| Aarav Sharma | aarav@college.edu | Student timetable (CSE-2A) |

**Reset demo data** on the HOD dashboard reloads everything, including one pending leave so the approval flow can be shown right away.

## Suggested demo flow (3 minutes)

1. HOD → approve Prof. Ravi Rao's pending leave → substitutes are requested instantly.
2. Log in as the requested teacher → accept the class.
3. Mehta → apply a **Morning** leave from the calendar → balance drops by ½.
4. HOD → decline with a reason → Mehta sees the reason.
5. HOD → **Download report** for the month.
6. Student → timetable shows the substitute.

## API

| Method | Route | Role | What it does |
| --- | --- | --- | --- |
| POST | `/api/auth/email-code` | public | Send a 6-digit code to the email |
| POST | `/api/auth/email-login` | public | Name + email + code → JWT |
| POST | `/api/auth/login` | public | Demo accounts (email + password) |
| POST | `/api/auth/complete-profile` | all | Role + subjects on first login |
| GET | `/api/auth/me` | all | Current user |
| POST | `/api/leaves` | faculty | `{ date, endDate?, session, periods?, text? }` → pending leave |
| GET | `/api/leaves/schedule` | faculty | Weekly classes, leave dates, balance |
| GET | `/api/leaves/mine` | faculty | My leaves, status, HOD note, cover |
| GET | `/api/leaves/summary` | faculty | My year at a glance |
| GET | `/api/notifications` | all | Items for the bell |
| POST | `/api/leaves/:id/cancel` | faculty | Withdraw a pending leave (all its days) |
| GET | `/api/proxies/mine` | faculty | Requests waiting for me (with reply deadline) + accepted |
| GET | `/api/proxies/calendar.ics` | faculty | My cover lectures as a calendar file |
| POST | `/api/proxies/:id/respond` | faculty | `{ action: "accept" \| "decline" }` |
| GET | `/api/hod/overview` | hod | Leave requests, stats, proxies, load |
| POST | `/api/hod/leaves/:id/decide` | hod | `{ action: "approve" \| "decline", note }` |
| POST | `/api/hod/proxies/:id/skip` | hod | No reply → next teacher |
| GET | `/api/hod/report?month=YYYY-MM` | hod | Monthly CSV report |
| GET | `/api/hod/summary` | hod | Weekly note |
| GET | `/api/hod/insights` | hod | Coverage, time to cover, fairness, trends |
| GET | `/api/hod/today` | hod | Today's classes needing cover (for the live campus) |
| POST | `/api/live/ticket` | all | One-minute ticket for the live stream |
| GET | `/api/live?ticket=…` | all | Server-Sent Events: live updates |
| POST | `/api/hod/reset-demo` | hod | Reload demo data |
| GET | `/api/student/schedule` | student | Today + tomorrow with substitutes |
| GET | `/api/health` | public | Status check |

## Deploy (Render, free)

1. Push this repo to GitHub.
2. On [render.com](https://render.com): **New → Blueprint** → pick this repo. `render.yaml` creates the web service and a free PostgreSQL database.
3. Fill in the secrets it asks for: `SMTP_USER` (sender Gmail) and `BREVO_API_KEY` (free from brevo.com) for OTP emails — Render's free plan blocks SMTP, so email goes through Brevo's web API. `GEMINI_API_KEY` is optional.
4. Click **Apply**. Tables and demo data are created on first start. Every push to `main` redeploys automatically.

The free plan sleeps after 15 idle minutes; the **Keep site awake** GitHub Action pings `/api/health` every 10 minutes to prevent that. You can also run it manually from the repo's **Actions** tab.

## The 3D campus

The home page opens on a live, realistic Indian school campus rendered in the browser with three.js:

- U-shaped three-storey school with open verandah corridors, columns, parapets and railings, classroom doors, grilled windows, concrete sunshades, weathered cream-and-maroon plaster, a terrace with water tanks and solar panels, a clock tower and an entrance porch
- assembly courtyard with the national flag, students in uniform lined up in the morning and walking home in the evening, teachers in the corridors
- library with a Mangalore-tile roof, basketball court, running track and football pitch, bicycle stand, bus bay with school buses, coconut palms and shade trees moving in the wind
- the road outside with black-and-yellow kerbs, a zebra crossing, traffic, auto-rickshaws, electric poles with sagging wires, and the town stretching to the horizon
- physical sky and sunlight, image-based lighting, soft shadows, ambient occlusion, bloom and filmic tone mapping; sound, and a 7-stop guided tour

**A full school day for 1,000+ students plays out** (about ten minutes, from the gate opening to the gate closing): teachers drive in and park nose-first; four school buses pull into their own drive-through bays and children climb down; autos queue at the gate and drop children; hundreds more walk in along the road, school bags on their backs, and go up the stairs to their classrooms. At the assembly bell every class comes down and forms its own line in the courtyard (40 classes, boys and girls side by side, an aisle down the middle for the teachers), then the lines break up from the back and everyone goes back up. A PE class runs laps of the track, lunch brings groups out into the yard and a basketball game, football in the afternoon. At home time the classes empty out with their bags — to their bus (each bus leaves when its children are on board, one at a time through the gate), to the autos waiting at the kerb, or along the road home — and teachers back out of their bays and drive off as the sun sets. Vehicles keep their distance and wait for each other, so nothing ever drives through anything. A director camera follows whatever is happening; a live clock shows the time and lets you jump to any part of the day. It starts at the real time of day.

**Runs on ordinary laptops and phones**: the scene picks a quality level from the graphics chip, then watches its own frame rate and trades detail for speed while running (resolution, then effects). Students are baked walk/run cycle frames drawn with instancing in two levels of detail (far students use a 450-triangle mesh and a soft blob shadow), only students in view are drawn, and meshes are simplified with meshoptimizer — so a thousand students cost a few dozen draw calls.

The app screens use rendered photos of the same campus (`client/public/campus/stills`) so they stay light on phones. Open `/?still=morning` or `/?still=evening` to re-render them.

Code: `client/src/campus/`. Devices get a quality level automatically (`?q=high|medium|low` to force one).

### Asset credits

- Trees: [EZ-Tree](https://github.com/dgreenheck/ez-tree) by Daniel Greenheck (MIT) — vendored in `client/src/campus/vendor/ez-tree`
- Animated figure (Xbot), Parrot and Stork models, brick, wood and grass textures, lens flare: from the [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples) (MIT; Xbot originally from Mixamo)
- Cloud sprite: [pmndrs/drei-assets](https://github.com/pmndrs/drei-assets)
- Plaster, concrete, asphalt, pavers, track, tiles, roof tiles, palm and weathering textures: generated for this project
- Ambient occlusion: [N8AO](https://github.com/N8python/n8ao) (ISC)

## Future scope

WhatsApp bot for leave and replies · exam invigilation duty allocation with the same engine · syllabus tracking for richer handover notes · multi-department support.
