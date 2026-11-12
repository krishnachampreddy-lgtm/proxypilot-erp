# ProxyPilot ERP API

ProxyPilot plugs into a school's ERP (Teachmint, Entab CampusCare, Fedena, MyClassboard, an in-house system…) as an extension. The ERP keeps owning the school's data; ProxyPilot handles substitute (proxy) lectures and tells the ERP who covers each class.

```
            teachers · students · weekly timetable · leaves
  School ERP  ─────────────────────────────────────────────▶  ProxyPilot
             ◀─────────────────────────────────────────────
            leave.approved · leave.declined · cover.assigned · cover.passed · cover.failed
```

There are two ways for data to come in, and the ERP can use either or both:

| | ERP pushes (recommended) | ProxyPilot pulls ("Get latest") |
| --- | --- | --- |
| How | The ERP calls `PUT /api/v1/teachers`, `/students`, `/timetable` whenever its data changes | The HOD presses **Get latest**; ProxyPilot calls `GET {erp}/teachers`, `/students`, `/timetable` |
| The ERP needs | ProxyPilot's API key | An API that returns the formats below |

Leaves always come in through `POST /api/v1/leaves`. Updates always go out as webhooks.

## 1. Getting the keys

The school’s HOD opens **ProxyPilot → School ERP → Technical setup** and:

1. Copies the **ProxyPilot API address**, for example `https://proxypilot-erp.onrender.com/api/v1`.
2. Presses **Create API key**. The key, `pp_live_…`, is shown once. Making a new key switches the old one off at once.
3. Enters the ERP's **webhook address**, which must be `https://`, and presses **Create secret**. The secret, `whsec_…`, is shown once.
4. For "Get latest" only: enters the ERP's API address and key.

ProxyPilot stores only a fingerprint (hash) of the API key. It stores the webhook secret and the ERP's key encrypted.

## 2. Calling ProxyPilot

Every call carries the key:

```
Authorization: Bearer pp_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

You can make up to 240 calls a minute. Errors come back as `{ "error": "plain-English message" }`, with these status codes:

| Status | Meaning |
| --- | --- |
| 400 | Something in the request is wrong |
| 401 | The key is missing or wrong |
| 404 | The record or route doesn't exist |
| 409 | It clashes with existing data, e.g. a leave on the same day |
| 429 | Too many calls |

### Check the connection

`GET /api/v1/ping` returns this:

```json
{ "ok": true, "school": "Demo School ERP", "today": "2026-11-12",
  "events": ["leave.approved", "leave.declined", "cover.assigned", "cover.passed", "cover.failed"] }
```

### Teachers

`PUT /api/v1/teachers`

```json
{ "teachers": [
  { "erpId": "T01", "name": "Dr. Anita Mehta", "email": "mehta@school.in", "subjects": ["DBMS", "Python"] }
] }
```

- `erpId` is the ERP's own id, and it is how both systems refer to the teacher from now on.
- A teacher is matched by `erpId` first, then by `email`. Existing teachers are updated and new ones are created.
- Teachers missing from the list are left alone. Nobody is deleted.
- Teachers sign in to ProxyPilot with that email, using a one-time code. They need no password.

The reply looks like this:

```json
{ "ok": true, "received": 8, "created": 1, "updated": 7, "skipped": [] }
```

### Students

`PUT /api/v1/students`

```json
{ "students": [ { "erpId": "S0001", "name": "Aarav Sharma", "email": "aarav@school.in", "className": "CSE-2A" } ] }
```

Students see their class timetable, including who is covering each class.

### Weekly timetable

`PUT /api/v1/timetable` replaces the whole timetable in one go. Either all of it is saved or none of it is.

```json
{ "entries": [
  { "day": "Mon", "period": 1, "className": "CSE-2A", "subject": "DBMS",
    "teacherErpId": "T01", "topic": "Normalization — 2NF and 3NF" }
] }
```

- `day` is one of `Mon`, `Tue`, `Wed`, `Thu`, `Fri` or `Sat`.
- `period` is 1–6. The times are P1 9:00, P2 9:50, P3 11:00, P4 11:50, P5 1:30 and P6 2:20.
- `teacherErpId` must belong to a teacher already sent. You can use `teacherEmail` instead.
- `topic` is optional. It goes into the substitute's handover note.
- One teacher can't have two classes in the same period. If the timetable has any problem, nothing is changed and the reply lists the problems.

The reply looks like this:

```json
{ "ok": true, "periods": 144, "classes": 4, "teachers": 8 }
```

### Leaves

`POST /api/v1/leaves`

```json
{
  "erpRef": "LV-1001",
  "teacherErpId": "T01",
  "date": "2026-11-12",
  "endDate": "2026-11-13",
  "session": "full",
  "reason": "Fever, doctor advised rest",
  "approved": true
}
```

| Field | Meaning |
| --- | --- |
| `erpRef` | Required. The ERP's id for this leave. If you send the same `erpRef` again, you get the first result back, so retries are safe. |
| `teacherErpId` / `teacherEmail` | Which teacher is away. |
| `date`, `endDate` | `YYYY-MM-DD`. `endDate` is optional, for leave of several days. Sundays are skipped, and a leave can be at most a month long. |
| `session` | `full`, `morning` (P1–P4), `afternoon` (P5–P6) or `periods` (then send `"periods": [1, 3]`). |
| `approved` | `true`: already approved in the ERP, so ProxyPilot starts finding substitutes at once. `false` or left out: it waits for the HOD's approval in ProxyPilot. |

The reply is `201`, with the leave and its covers:

```json
{
  "ok": true, "erpLeaveRef": "LV-1001", "status": "approved",
  "teacher": { "erpId": "T01", "name": "Dr. Anita Mehta" },
  "days": [ { "date": "2026-11-12", "status": "approved", "periods": [1, 3, 5] } ],
  "covers": [
    { "coverId": 50, "date": "2026-11-12", "period": 1, "time": "9:00–9:50",
      "className": "CSE-2A", "subject": "DBMS",
      "absentTeacher": { "erpId": "T01", "name": "Dr. Anita Mehta" },
      "askedNow": { "erpId": "T08", "name": "Dr. Priya Das" },
      "substitute": null, "status": "pending",
      "reason": "Free in period 1, teaches DBMS, knows CSE-2A, no proxies this month",
      "handoverNote": "Class CSE-2A, DBMS (period 1). Continue from: Normalization — 2NF and 3NF." }
  ]
}
```

If the teacher has no classes in that time, the reply is `{ "ok": true, "status": "no-classes" }` and there is nothing to cover.

Two related calls:

- `GET /api/v1/leaves/{erpRef}` returns the same shape, with the latest state.
- `GET /api/v1/covers?date=2026-11-12` returns every cover on that day, which is useful for showing substitutes in the ERP's timetable.

`GET /api/v1/people` lists the teachers and students ProxyPilot knows, with the ERP ids it has matched.

## 3. Webhooks: updates from ProxyPilot

ProxyPilot sends a `POST` to the ERP's webhook address every time something changes:

| Event | When |
| --- | --- |
| `leave.approved` | A leave was approved, by the HOD or already in the ERP, and substitutes are being asked |
| `leave.declined` | The HOD declined it, or nobody at all could cover a class |
| `cover.assigned` | A substitute said yes. Show them in the ERP timetable. |
| `cover.passed` | The teacher asked said no or didn't answer in 15 minutes, so the next best teacher is being asked |
| `cover.failed` | Nobody could take the class |
| `ping` | A test sent with **Send a test update** |

The body looks like this:

```json
{
  "id": "evt_7c1f…",
  "event": "cover.assigned",
  "createdAt": "2026-11-12T03:41:10.512Z",
  "data": {
    "coverId": 50, "leaveId": 24, "erpLeaveRef": "LV-1001",
    "date": "2026-11-12", "day": "Thu", "period": 1, "time": "9:00–9:50",
    "className": "CSE-2A", "subject": "DBMS",
    "absentTeacher": { "erpId": "T01", "name": "Dr. Anita Mehta" },
    "substitute": { "erpId": "T08", "name": "Dr. Priya Das" },
    "status": "accepted"
  }
}
```

The `leave.*` events carry `teacher`, `dates`, `reason`, `note`, `erpLeaveRef` and `classes`.

Answer with any 2xx status within 8 seconds. Anything else is retried twice, after 20 seconds and again after 60 seconds. Use `id` to ignore a message you have already handled.

### Checking the signature

Every webhook carries these headers:

```
X-ProxyPilot-Event: cover.assigned
X-ProxyPilot-Timestamp: 1794456070
X-ProxyPilot-Signature: sha256=5d2c…
```

The signature is an HMAC-SHA256 of `"<timestamp>.<raw body>"`, keyed with the webhook secret. Check it, and reject timestamps more than 5 minutes old.

```js
// Node.js
import crypto from 'node:crypto';

function isFromProxyPilot(rawBody, headers, secret) {
  const ts = headers['x-proxypilot-timestamp'];
  const sig = String(headers['x-proxypilot-signature'] || '').replace('sha256=', '');
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
```

```python
# Python
import hmac, hashlib, time

def is_from_proxypilot(raw_body: bytes, headers, secret: str) -> bool:
    ts = headers.get("X-ProxyPilot-Timestamp", "")
    sig = headers.get("X-ProxyPilot-Signature", "").removeprefix("sha256=")
    if abs(time.time() - int(ts or 0)) > 300:
        return False
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)
```

Use the **raw** request body exactly as it arrived, not one re-encoded after parsing.

## 4. Reading from the ERP: "Get latest"

If the ERP offers an API, ProxyPilot can read from it. It sends `Authorization: Bearer <the ERP's key>` with three calls:

| Call | Returns |
| --- | --- |
| `GET {erp}/teachers` | `{ "teachers": [ … ] }`, the same shape as `PUT /api/v1/teachers` |
| `GET {erp}/students` | `{ "students": [ … ] }` |
| `GET {erp}/timetable` | `{ "entries": [ … ] }` |

If an ERP's own API returns other shapes, a small adapter maps them. The adapter goes in `server/src/services/erp.js`, at `syncFromErp`.

## 5. Try it without a real ERP

ProxyPilot ships with a **Demo School ERP** at `/demo-erp`. To use it:

1. In **School ERP**, press **Try with a demo school**. Both sides are set up and a first sync runs.
2. In the demo ERP, send a leave. It goes to ProxyPilot's API.
3. Next to each class in **Today's changes**, press **Open as …** to open ProxyPilot as the teacher who was asked, and accept or decline. This only works for the built-in demo teachers.
4. The demo ERP receives signed webhooks and shows today's substitutes.

The demo ERP only answers while ProxyPilot is connected to it.

## 6. Security notes

- Keys are long and random. ProxyPilot stores only their SHA-256 hash, and a new key switches the old one off.
- The webhook secret and the ERP's key are stored with AES-256-GCM encryption, keyed from the server's `JWT_SECRET`.
- Webhook and ERP addresses must be `https://`. Private network addresses are refused.
- Each ProxyPilot site serves one school, so one school's data never mixes with another's.
- Under India's DPDP Act 2023, the school is the data fiduciary and ProxyPilot processes data on its behalf. Agree this in writing before going live.
