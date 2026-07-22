# QuickCart — Serverless Cost-Optimized Order Processing System on AWS

A fully serverless, event-driven order processing pipeline built on AWS. Scales to zero at idle, absorbs traffic spikes without dropping orders, stays within a fixed monthly budget, and was manually deployed and stress-tested end to end.

🔗 **Live Demo:** https://luminous-alfajores-9744a5.netlify.app
🔗 **GitHub:** https://github.com/RASHMIBB23/aws-url-project

---

## Problem

Traditional always-on checkout systems have four recurring issues:

- **Idle cost** — a server running 24/7 costs the same at 3 AM with zero traffic as during a spike with thousands of orders/minute.
- **Traffic spikes cause failures** — a fixed-capacity server chokes under sudden load, and orders get dropped.
- **Synchronous writes block checkout** — if the "save order to database" step is slow or fails, the customer waits or the order is silently lost.
- **No visibility** — failures go unnoticed until a customer complains; spend is unpredictable until the bill arrives.

## Solution

QuickCart replaces the always-on server with a fully serverless, decoupled pipeline:

- **API Gateway + Lambda** — nothing runs, and nothing costs money, when there's no traffic.
- **SQS** — the checkout API queues the order and responds immediately; a separate Lambda processes it asynchronously, so spikes are absorbed instead of causing failures.
- **SQS Dead Letter Queue** — if an order fails processing 3 times, it's isolated in a DLQ instead of being lost or retried forever.
- **DynamoDB** — every order is persisted with a status (`PENDING` → `PROCESSED`).
- **CloudWatch + SNS** — alarms on Lambda errors and queue backlog notify me before customers notice.
- **AWS Budgets** — alerts at 85%/100% of a fixed monthly threshold so spend never silently grows.

---

## Architecture

```
User Browser (Netlify-hosted frontend)
     │
     ▼ (Place Order / Get Orders)
API Gateway
     │
     ├──► Lambda: PlaceOrder ──► SQS (OrderQueue) ──► Lambda: ProcessOrder ──► DynamoDB (Orders table)
     │                                  │
     │                                  ▼ (after 3 failed attempts)
     │                              SQS DLQ (OrderQueue-DLQ)
     │
     └──► Lambda: GetOrders ◄─────────────────────────────────────────── (reads from DynamoDB)

CloudWatch Alarms ──► SNS (QuickCartAlerts) ──► Email alerts
AWS Budgets ──► Email cost alerts
IAM ──► least-privilege role on every Lambda
```

**Services used:** API Gateway, Lambda, SQS (+DLQ), DynamoDB, CloudWatch, SNS, IAM, AWS Budgets. Frontend hosted separately on Netlify (S3+CloudFront is documented as an alternative below).

---

## Repository Structure

```
quickcart-aws/
├── frontend/
│   ├── index.html          # Product page + live order status table
│   └── app.js                # Calls API Gateway, polls order status
├── backend/
│   ├── place-order/index.js     # Lambda: validates order, sends to SQS
│   ├── process-order/index.js   # Lambda: SQS trigger, writes to DynamoDB
│   ├── get-orders/index.js      # Lambda: returns recent orders for dashboard
├── architecture/
│   └── architecture-diagram.svg
└── README.md
```

---

## Manual AWS Setup Guide

Everything below was built by hand in the AWS Console — no CloudFormation/Terraform, to build hands-on understanding of every service.

### 1. IAM
- Created 3 execution roles: `PlaceOrder-Role`, `ProcessOrder-Role`, `GetOrders-Role`
- Each attached with `AWSLambdaBasicExecutionRole` plus scoped access to the specific services it needs (SQS, DynamoDB)

### 2. DynamoDB
- Table `Orders`, partition key `orderId` (String), on-demand capacity (pay-per-request, no idle cost)

### 3. SQS
- `OrderQueue-DLQ` created first (Standard)
- `OrderQueue` created with a redrive policy pointing to the DLQ, `maxReceiveCount = 3`

### 4. Lambda
Three Node.js 20.x/22.x functions — `PlaceOrder`, `ProcessOrder`, `GetOrders` — each with the matching IAM role and environment variables (`ORDER_QUEUE_URL`, `ORDERS_TABLE`). `ProcessOrder` has an SQS trigger on `OrderQueue` with batch size 1.

### 5. API Gateway
HTTP API `QuickCart-API` with routes `POST /order` → `PlaceOrder`, `GET /orders` → `GetOrders`. CORS enabled (`Access-Control-Allow-Origin: *`) since the frontend is hosted on a different domain (Netlify).

### 6. Frontend Hosting
Deployed via **Netlify Drop** (drag-and-drop `frontend/index.html` and `frontend/app.js`) for a fast public URL.
*Alternative (AWS-native) option, documented but not used in the final deploy:* S3 bucket + CloudFront distribution with Origin Access Control — same result, more AWS-native for a resume story, more setup steps.

### 7. CloudWatch + SNS
- SNS topic `QuickCartAlerts`, email subscription confirmed
- Alarm `ProcessOrder-Errors-Alarm`: triggers when Lambda `Errors` > 0 (period lowered to 1 minute for faster feedback during testing)
- Alarm `OrderQueue-Backlog-Alarm`: triggers when `ApproximateNumberOfMessagesVisible` > 10
- Both alarms configured to notify on **all three states** (In alarm / OK / Insufficient data) — see Troubleshooting below for why this matters

### 8. AWS Budgets
Monthly cost budget of $10, with alerts at 85% actual spend, 100% actual spend, and 100% forecasted spend, sent to email.

---

## Testing Performed

### Happy path
1. Opened the live Netlify URL, clicked "Place Order"
2. Confirmed the order appeared in the dashboard, status flipped from `PENDING` to `PROCESSED` within ~10 seconds
3. Confirmed the item existed in the DynamoDB `Orders` table via **Explore table items**

### Failure / fault-tolerance path (the key proof point)
1. Manually removed `AmazonDynamoDBFullAccess` from `ProcessOrder-Role` in IAM
2. Placed a new order on the live site
3. Watched SQS retry the message up to 3 times, then automatically move it into `OrderQueue-DLQ`
4. Confirmed `OrderQueue-DLQ` showed the failed message(s), while `OrderQueue` itself returned to 0 (no infinite retry loop)
5. Confirmed `ProcessOrder-Errors-Alarm` flipped to **"In alarm"** in CloudWatch
6. Restored `AmazonDynamoDBFullAccess` to `ProcessOrder-Role`
7. Placed a new order and confirmed normal processing resumed

This demonstrates the system fails safely: no infinite retries, no silently lost orders, and the failure is both isolated (DLQ) and observable (CloudWatch alarm).

---

## Troubleshooting Log (real issues hit during manual deployment)

Documenting these because working through them is a legitimate part of the engineering — not just clicking "create" successfully every time.

| Issue | Cause | Fix |
|---|---|---|
| GitHub repo showed a `.zip` file instead of code | Uploaded the compressed archive itself instead of its extracted contents | Deleted the zip, extracted locally, re-uploaded the actual folder contents |
| Repo had a double-nested `quickcart-aws/quickcart-aws` folder | Dragged the outer folder into the upload box instead of its contents | Deleted the nested folder, re-uploaded from one level deeper |
| Frontend loaded a blank page on Netlify (no products, "No orders yet" static) | Uploaded files were auto-renamed by the OS to `index (1).html` / `app (1).js`, breaking the `<script src="app.js">` reference | Renamed files back to exactly `index.html` and `app.js` before re-uploading |
| CloudWatch alarm never sent an email despite going "In alarm" | SNS email subscription was still in **"Pending confirmation"** status — the confirmation email had never been clicked | Found (or resent) the confirmation email and clicked **Confirm subscription** |
| Alarm flipped to **"Insufficient data"** instead of "OK", and still no email | The alarm's notification action was only configured to trigger on the **"In alarm"** state, not on "OK" or "Insufficient data" | Edited the alarm to send notifications for all three states |
| Adding an SNS "order confirmation" email feature caused the live "Place Order" button to fail with an API 500 error | A `PublishCommand`/`SNSClient` import or permission issue at Lambda module-load time crashed the function before its internal try/catch could run | Reverted `PlaceOrder` to the stable SQS-only version; decided to keep order-confirmation emails as a documented future enhancement rather than risk core-path stability |
| DynamoDB `Orders` table accumulated leftover/malformed test rows (`undefined` product name, `Invalid Date`) from manual testing | Manual test invocations with incomplete payloads | See **Cleaning Up Test Data in DynamoDB** below |

---

## Cleaning Up Test Data in DynamoDB

Because orders were placed manually many times while testing (including deliberately-broken tests), the `Orders` table accumulates junk rows over time. There is no in-app delete button by design (kept the demo to Create + Read for scope) — cleanup is done directly in the console:

1. AWS Console → **DynamoDB** → **Tables** → click `Orders`
2. Click **Explore table items**
3. Click **Run** (Scan) if the list isn't already showing
4. Check the checkbox next to any row you want removed (e.g. malformed test rows, or the 3 messages generated during the deliberate DLQ failure test)
5. Click **Actions** → **Delete items** → confirm

To clear everything and start fresh instead of deleting row by row, delete and recreate the table (partition key `orderId`, String, on-demand capacity) — faster when there's a lot of test data to remove.

The 3 messages that landed in `OrderQueue-DLQ` during the failure test can also be purged the same way if you don't want them lingering:
1. **SQS** → `OrderQueue-DLQ` → **Purge** → confirm

*(Kept mine in place intentionally as visible evidence the failure-handling test worked — worth doing the same before an interview demo, then purging afterward.)*

---

## Why These Design Choices

- **SQS between the API and the database write** — the customer gets an instant "order accepted" response; the actual processing happens asynchronously, so a slow or failing database write never blocks checkout.
- **Dead Letter Queue** — prevents infinite retry loops and makes failed orders visible and inspectable instead of silently disappearing.
- **On-demand DynamoDB + serverless everything** — the whole system costs close to nothing when idle, and scales automatically under load without manual intervention.
- **CloudWatch alarms on all three states** — an alarm that only notifies on "In alarm" can silently miss recovery/insufficient-data transitions; notifying on all state changes gives full visibility into the system's health, not just its failures.

---

## How I Present This on My Resume

**Project line:**
> QuickCart — Serverless Order Processing System (AWS) — [GitHub] [Live Demo]

**Resume bullet:**
> Designed and manually deployed a serverless, event-driven order processing system on AWS (API Gateway, Lambda, SQS, DynamoDB, CloudWatch/SNS, IAM, AWS Budgets); implemented dead-letter-queue error isolation, validated fault tolerance through a live failure-injection test, and deployed a public demo frontend.

**What I say in an interview when asked to walk through it:**
1. Start with the problem (idle cost, traffic spikes, silent data loss, no visibility) — 30 seconds.
2. Walk the request through the diagram: API Gateway → Lambda → SQS → Lambda → DynamoDB.
3. Lead with the failure test, not just the happy path: *"I intentionally removed a permission to simulate a database outage, watched the message retry three times and land safely in a dead-letter queue instead of disappearing, and confirmed I got an automated alert."* This is the single strongest, most differentiating thing to say — most beginner projects only demo the happy path.
4. If asked about challenges: describe one item from the Troubleshooting Log above (e.g. the SNS module-import crash) and how I diagnosed it via CloudWatch Logs and made the call to revert rather than risk core stability — this shows engineering judgment, not just "it worked."
5. If asked what you'd improve with more time: mention the documented next steps below.

---

## Possible Future Enhancements (documented, not built, to avoid destabilizing the working system)

- Order-confirmation emails via SNS `PublishCommand` in `PlaceOrder` (attempted; reverted after it destabilized the core path — see Troubleshooting Log)
- Idempotency check in `ProcessOrder` before writing to DynamoDB, to safely handle SQS's at-least-once delivery guarantee
- A `DeleteOrder` Lambda + `DELETE /order/{orderId}` API route for full CRUD instead of Create + Read only
- Move frontend from Netlify to S3 + CloudFront for an all-AWS resume story
- Least-privilege IAM policies in place of the broader `*FullAccess` managed policies used during development

---

## License

MIT — feel free to fork and adapt.
