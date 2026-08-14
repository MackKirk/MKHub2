# Inbound email → Project / Opportunity Notes (Microsoft 365)

Outbound Hub mail already uses **Office 365 SMTP** (`smtp.office365.com` /
`no-reply@mackkirk.com`). Inbound Notes uses the **same Microsoft 365 tenant**
via a shared mailbox + **Power Automate** HTTP call into the Hub webhook.

Forward or BCC to `notes@mackkirk.com`. If the sender is `@mackkirk.com` or
`@mackkirkroofing.com` and the subject (or body) contains `MK-#####`, a
Notes/History entry is created on that project/opportunity.

## Behaviour

| Rule | Detail |
|------|--------|
| Recipients | `INBOUND_EMAIL_NOTES_ADDRESSES` (default `notes@mackkirk.com`) |
| Sender allowlist | `INBOUND_EMAIL_ALLOWED_DOMAINS` |
| Project match | First `MK-#####` in subject, else early body |
| Category | `client-communication-log` by default |
| Auth | Shared secret required; empty secret → 503 |
| Display | Stores plain `description` + `images.inbound_email.body_html`. Web UI renders sanitized HTML for inbound notes only; manual notes stay plain text. Mobile uses plain text. |

## Endpoint (Hub)

`POST https://mkhub2.onrender.com/webhooks/inbound-email?secret=<SECRET>`

Also accepted: header `X-Inbound-Email-Secret` or `Authorization: Bearer <SECRET>`.

### JSON body (Power Automate)

```json
{
  "from": "Alex <alex@mackkirk.com>",
  "to": "notes@mackkirk.com",
  "cc": "",
  "subject": "Re: Confirmation MK-00497",
  "body": "<p>Email HTML or plain text</p>",
  "text": "optional plain text",
  "message_id": "unique-id-from-outlook",
  "attachments": [
    {
      "filename": "quote.pdf",
      "content_type": "application/pdf",
      "content_base64": "<base64>"
    }
  ]
}
```

`attachments` is optional (v1 can ship without them).

## IT setup — step by step

Copy/paste this section for IT.

### A. Render (app team — before or with IT)

1. Set environment variables on `mk-hub-api`:
   - `INBOUND_EMAIL_WEBHOOK_SECRET` = long random string (share with IT for the Flow URL)
   - `INBOUND_EMAIL_NOTES_ADDRESSES` = `notes@mackkirk.com`
   - `INBOUND_EMAIL_ALLOWED_DOMAINS` = `mackkirk.com,mackkirkroofing.com`
2. Deploy the build that includes `/webhooks/inbound-email`.

### B. Microsoft 365 — shared mailbox

1. In **Microsoft 365 admin center** → **Teams & groups** → **Shared mailboxes** (or Exchange admin).
2. Create shared mailbox: **`notes@mackkirk.com`**.
3. Give a service account (or the person who owns Power Automate) permission to read that mailbox
   (**Full Access** is fine for the Flow connection).

### C. Power Automate — cloud flow

1. Go to [https://make.powerautomate.com](https://make.powerautomate.com) (same tenant as Mack Kirk).
2. **Create** → **Automated cloud flow**.
3. Name: `MK Hub — Notes inbound`.
4. Trigger: **When a new email arrives in a shared mailbox (V2)**  
   (If that trigger is unavailable: **When a new email arrives (V3)** on a mailbox that receives
   mail for `notes@…`, or use a user mailbox with a forward from the shared box.)
5. Folder: **Inbox**. Include attachments: **Yes** (if you will map attachments; otherwise No for v1).
6. Add action: **HTTP**
   - **Method:** `POST`
   - **URI:**  
     `https://mkhub2.onrender.com/webhooks/inbound-email?secret=PASTE_SECRET_HERE`
   - **Headers:**
     - `Content-Type` = `application/json`
   - **Body** (switch to JSON mode). Example using dynamic content from the trigger:

```json
{
  "from": "@{triggerOutputs()?['body/from']}",
  "to": "notes@mackkirk.com",
  "cc": "@{triggerOutputs()?['body/ccRecipients']}",
  "subject": "@{triggerOutputs()?['body/subject']}",
  "body": "@{triggerOutputs()?['body/body']}",
  "message_id": "@{triggerOutputs()?['body/internetMessageId']}"
}
```

   Field names vary slightly by connector version. Map:

   | Hub JSON field | Outlook / Flow dynamic content |
   |----------------|-------------------------------|
   | `from` | From |
   | `to` | hardcode `notes@mackkirk.com` (recommended) |
   | `subject` | Subject |
   | `body` | Body (or Body Preview) |
   | `message_id` | Internet Message ID (or Id) |

7. **Save** the flow and turn it **On**.

### D. Optional — attachments in the Flow

If needed later:

1. After the trigger, add **Get Attachment (V2)** (or apply to each attachment).
2. In the HTTP body `attachments` array, set `filename`, `content_type`, and
   `content_base64` from the attachment content (base64).

Skip this for the first go-live if IT wants a simpler flow.

### E. Test

1. From a **`@mackkirk.com`** mailbox, send or forward an email **To** `notes@mackkirk.com`
   with subject containing a real code, e.g. `Test MK-00497`.
2. Confirm the Flow run succeeded (green) in Power Automate.
3. Open that project/opportunity in MK Hub → **Notes/History** — a new note should appear
   (category Client Communication Log).

### F. Expected Hub responses (Flow HTTP output)

| `status` | Meaning |
|----------|---------|
| `created` | Note created |
| `duplicate` | Same `message_id` already processed |
| `discarded_bad_domain` | From not @mackkirk.com / @mackkirkroofing.com |
| `discarded_no_code` | No `MK-#####` in subject/body |
| `discarded_project_not_found` | Code not found in Hub |
| `ignored_unrouted` | `to` not in notes addresses |

HTTP **401** = wrong secret. **503** = secret not set on Render yet.

## Security notes for IT

- Treat `INBOUND_EMAIL_WEBHOOK_SECRET` like a password; put it only in the Flow URI or as a
  header `X-Inbound-Email-Secret` (prefer not committing it to shared docs long-term).
- Only company domains create notes; external senders are discarded by the Hub.
- The Hub does **not** need the `no-reply@` SMTP password for inbound — that account is outbound only.

## Future

Property monitoring can reuse the same webhook with a **different** shared mailbox address
and a new handler branch in the app.
