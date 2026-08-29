# Scripts Directory

Utility scripts for managing the Psychomments project.

---

## nuke-and-remigrate.sh

**Complete data reset** - Deletes all data and recreates schema from scratch.

### Usage

```bash
./scripts/nuke-and-remigrate.sh
```

### What It Does

✅ **Deletes:**
- All D1 database records
- All R2 objects (if API token provided)
- All KV entries (admin + iot namespaces)

✅ **Recreates:**
- All 7 D1 tables
- All indexes
- Foreign key relationships

✅ **Preserves:**
- Firewall rules (WAF /spider/*)
- Access policies (/ant/*)
- mTLS certificates & settings

### Safety

- ⚠️ **Confirmation Required** - Must type `YES-NUKE-EVERYTHING`
- 🔒 **Reversible Only With Backups** - No undo possible
- 📝 **Logs Changes** - Detailed output shows each step

### Optional: R2 Automation

To automatically delete R2 objects, set environment variables:

```bash
export CLOUDFLARE_API_TOKEN="cfp_xxxx..."
export ACCOUNT_ID="your-account-id"
./scripts/nuke-and-remigrate.sh
```

Without these, R2 cleanup is skipped (manual cleanup via dashboard or API needed).

---

## Full Flow

```
1. Confirmation prompt (type YES-NUKE-EVERYTHING)
   ↓
2. Drop all D1 tables (in dependency order)
   ↓
3. Clear R2 bucket (if API token provided)
   ↓
4. Clear KV namespaces (KV_ADMIN + IOT_KV)
   ↓
5. Recreate D1 schema (all tables + indexes)
   ↓
6. Verify schema (count tables)
   ↓
7. Deploy fresh worker
   ↓
✅ Complete - Fresh start ready!
```

---

## Example Output

```
⚠️  WARNING: This will PERMANENTLY DELETE ALL DATA!
This action cannot be undone.

Data to be deleted:
  - All D1 database records
  - All R2 objects
  - All KV entries

Type 'YES-NUKE-EVERYTHING' to confirm: YES-NUKE-EVERYTHING

Step 1: Dropping D1 tables...
  → Dropping comments...
  → Dropping topic_edits...
  → Dropping topics...
  → Dropping boards...
  → Dropping general_messages...
  → Dropping users...
  → Dropping iot_messages...
✅ D1 tables dropped

[... continues with R2, KV, schema recreation ...]

✅ NUKE COMPLETE - Fresh Start!

What was deleted:
  ✅ All D1 data
  ✅ All R2 objects
  ✅ All KV entries

What was preserved:
  ✅ Firewall rules
  ✅ Access policies
  ✅ mTLS certificates
```

---

## When to Use

- 🧪 **Testing** - Need clean state for experiments
- 🐛 **Debug** - Data corruption or bad state
- 🚀 **Migration** - Moving to new schema entirely
- 🧹 **Cleanup** - Removing test/junk data

---

## Requirements

- ✅ Wrangler CLI installed
- ✅ Cloudflare credentials configured
- ✅ jq (for JSON parsing, optional for some features)

---

## Related Files

- `src/index.ts` - Worker code (redeployed by script)
- `wrangler.toml` - Project config (D1/R2/KV bindings)

---

**Date Created:** August 29, 2026  
**Status:** ✅ Production-ready
