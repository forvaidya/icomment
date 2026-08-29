# Enhancements — Parked for Later

Items identified but deferred beyond core MVP (Steps 01-06).

## JWT Enforcement
**Issue:** JWT is optional in Worker code; CF Access provides gate at edge.
**Options:**
- A) Keep as is (CF Access gates; Worker treats unauthenticated as "Patron")
- B) Enforce JWT in Worker middleware (reject if no token)
- C) Enforce JWT only on write routes (POST/PUT/DELETE)

**Decision:** Parked. Revisit after Step 06 if stricter auth needed.

## CF Access Login Page Improvement
**Goal:** Customize CF Access login page with psychomments branding.
**Scope:**
- Add logo, colors, team name
- Custom domain (e.g., auth.psychomments.com)
- IdP selector (Google, GitHub, etc.)

**Decision:** Parked as Step 07 (after core features complete).

## Email Notifications
**Goal:** Send emails for key events (account created, request access, password reset, etc.).
**Requires:**
- Third-party email service (SendGrid free tier: 100/day, Mailgun, Resend, AWS SES)
- Worker API integration to send via service
- Email templates

**Decision:** Parked for Step 08+. Depends on:
- User profiles mature (Step 04)
- Access control/permissions feature (future step)

---

**Revisit:** After Step 06 complete, reassess priority based on user needs.
