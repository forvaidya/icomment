# Public Pages + Private Workers: A Beginner's Guide

## The Problem (Real World Analogy)

Imagine a restaurant:
- **Frontend** = the dining room (where customers sit and order)
- **Backend** = the kitchen (where recipes and cooking happen)

**Bad setup:** You put a window directly from the dining room to the kitchen. Anyone can peek in and see your secret recipes, your inventory, how much you paid for ingredients.

**Better setup:** You have a waiter (Pages Function) who takes orders from the dining room and passes them to the kitchen through a private door. The kitchen is completely hidden from customers.

---

## What This Architecture Does

This pattern separates your app into two parts:

1. **Public Pages** — the website everyone can visit
   - HTML, CSS, images, buttons, forms
   - Runs at Cloudflare's edge (fast, worldwide)
   - Example: `aspire-pages`

2. **Private Workers** — your business logic (hidden from the public)
   - Calculations, database reads/writes, secrets
   - Has NO public website address
   - Can only be called by your Pages application
   - Example: `aspire-math`

---

## How It Works: Step-by-Step

### 1. Browser Request
```
User's browser → "I want to visit aspire-pages.com" → Cloudflare edge
```
Public Pages loads and sends HTML/CSS/JavaScript to the browser.

### 2. User Clicks a Button
```
Browser → "Please calculate 2 + 3"
         ↓
Browser calls the Pages Function at /api/add
```

### 3. Pages Function (The Waiter)
```typescript
// File: pages/functions/api/add.ts
interface Env {
  ASPIRE_MATH: Fetcher;  // ← Secret door to the kitchen
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  // Fetch from the PRIVATE Worker (the customer can't access this URL directly)
  const response = await env.ASPIRE_MATH.fetch(
    `https://aspire-math/add?${url.searchParams}`
  );
  return response;
};
```

`Fetcher` is like a secret phone line directly to the kitchen. The browser can't use it—only Pages Functions can.

### 4. Private Worker Calculation
```
Pages Function → "Calculate 2 + 3" → ASPIRE_MATH Worker
                                      (does the calculation)
                                      returns → 5
```

### 5. Result Goes Back
```
Private Worker → 5 → Pages Function → Browser → User sees "Result: 5"
```

**Key point:** The browser NEVER directly talks to `aspire-math`. It doesn't even know the Worker's address.

---

## The Secret: `workers_dev = false`

By default, Cloudflare creates a public website for every Worker:
```
https://aspire-math.your-account.workers.dev
```

**This is the problem!** Anyone can visit this URL and access your private logic.

**The solution:** Tell Cloudflare: "Don't create a public website for this Worker."

```toml
# File: workers/aspire-math/wrangler.toml
name = "aspire-math"
workers_dev = false    # ← No public website!
```

Now:
- ❌ You can't visit `aspire-math.workers.dev` (doesn't exist)
- ❌ You can't call it from your browser (no public route)
- ✅ Your Pages application CAN call it (via Service Binding)
- ✅ Your business logic is hidden

---

## Service Binding: The Secret Door

[Service Binding](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/service-bindings/) is how Pages talks to the private Worker without HTTP.

**In Pages configuration:**
```toml
# File: pages/wrangler.toml
[[services]]
binding = "ASPIRE_MATH"     # Name you use in TypeScript
service = "aspire-math"     # The Worker's name
```

**In your code:**
```typescript
// ASPIRE_MATH is a Fetcher interface (Cloudflare Workers type)
// It implements the fetch() API, so you call it like:
env.ASPIRE_MATH.fetch(...)  // Uses the Service Binding
```

**Key concepts:**
- `fetch()` = standard Web API (function for making HTTP requests)
- `Fetcher` = Cloudflare Workers interface (type for Service Binding connections)
- Fetcher implements fetch(), so you use it like HTTP, but internally it's a direct Worker connection

No CORS issues, no authentication headers needed—it's an internal connection.

---

## Why This Matters

### Security
- Hackers can't find your private Worker (no public URL)
- Your database credentials stay secret
- Your business logic is hidden

### Organization
- Pages handles "what the user sees"
- Workers handle "how things work"
- Clear separation of concerns

### Flexibility
- Deploy Pages and Workers independently
- Change your backend without redeploying the frontend
- Test the backend with different frontends

---

## Common Mistakes to Avoid

### ❌ Mistake 1: Forgetting `workers_dev = false`
```toml
# WRONG - this creates a public URL
name = "aspire-math"
# workers_dev is missing or = true
```
**Fix:** Always set `workers_dev = false` for private Workers.

### ❌ Mistake 2: Calling Private Worker from Browser
```javascript
// WRONG - this doesn't work!
const response = await fetch('https://aspire-math.workers.dev/add');
```
**Fix:** Call through Pages Function only:
```javascript
// RIGHT
const response = await fetch('/api/add');  // Pages Function
```

### ❌ Mistake 3: Putting Secrets in Environment
```toml
# WRONG - this leaks into git history
[env.production]
DATABASE_PASSWORD = "shushma-shrikrishna"
```
**Fix:** Use `.dev.vars` (add to `.gitignore`):
```
# .dev.vars
DATABASE_PASSWORD=your-real-password

# .gitignore
.dev.vars
```

---

## Real-World Example: This Repository

```
worker_pages/
├── pages/
│   ├── index.html                    ← Frontend (public)
│   ├── functions/
│   │   └── api/add.ts               ← Pages Function (public)
│   └── wrangler.toml                ← Configures Service Binding
│
└── workers/
    └── aspire-math/
        ├── src/index.ts             ← Private logic
        └── wrangler.toml            ← workers_dev = false
```

**Data flow:**
```
Browser → /api/add (Pages Function) → [Service Binding] → aspire-math (private)
```

---

## Key Concepts Cheat Sheet

| Concept | What It Is | Example |
|---------|-----------|---------|
| **Pages** | Public frontend | `aspire-pages` (website everyone visits) |
| **Pages Function** | Public helper that talks to private Workers | `/api/add` endpoint |
| **Worker** | Backend logic | `aspire-math` (calculations) |
| **Service Binding** | Secret connection between Pages and Worker | `env.ASPIRE_MATH` |
| **Fetcher** | TypeScript type for Service Binding | `ASPIRE_MATH: Fetcher` |
| **workers_dev** | Setting that controls public URL | `workers_dev = false` disables public URL |

---

## Next Steps to Learn More

1. **Read the full architecture:** See [ARCHITECTURE.md](ARCHITECTURE.md)
2. **Understand Service Bindings:** [Cloudflare docs](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/service-bindings/)
3. **Learn about Fetcher:** [Cloudflare Fetcher API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
4. **Explore the code:**
   - Pages Function: [pages/functions/api/add.ts](pages/functions/api/add.ts)
   - Private Worker: [workers/aspire-math/](workers/aspire-math/)

---

## Questions to Test Your Understanding

1. **Why can't the browser directly call `aspire-math`?**
   - Answer: Because `workers_dev = false` means it has no public URL.

2. **What is a `Fetcher`?**
   - Answer: A TypeScript type that represents a Service Binding connection.

3. **What does the Pages Function do?**
   - Answer: It's the "waiter" that takes requests from the browser and passes them to the private Worker.

4. **Why is this better than having one public Worker?**
   - Answer: The private Worker is hidden, so hackers can't attack it directly.

---

**Made for learning.** Questions? Ask your dad or [read the Cloudflare docs](https://developers.cloudflare.com/workers/).
