# Product Engineering: Recipe Agent

## Vision

**Natural language recipe search engine with personalization** — not an AI recipe generator.

Users describe what they want ("Modak", "Modak but dairy-free", "spicy chicken rice"); the system:
1. Understands intent (NLP)
2. Finds/adapts recipes
3. Validates against culinary rules
4. Returns safe, practical, cookable recipes

Key insight: Recipe invention is fundamentally different from image generation. A hallucinated recipe is dangerous (wrong temps, bad allergen combos, unworkable methods), not just weird. Domain expertise is non-negotiable.

---

## Current Scope (Phase 1)

**What we have:**
- Natural language query → model attempts generation
- Diet/allergy filtering (code-enforced safety, not model-trusted)
- Web search fallback when model fails
- Web search result caching (skip model on subsequent requests)
- Session tracking + user feedback loop (Love It, Try Another, Substitute)

**What works:**
- Continental + well-known regional dishes (model knows them)
- Safety validation in code (vegan diet never gets non-vegan ingredient)
- Fallback prevents "no recipe" errors

**Limitations:**
- Unknown/regional recipes (Modak, regional variants) hit web search or fail
- Model sometimes invents instead of searching
- No expert validation layer
- No institutional knowledge (every query is independent)

---

## Future Phases (Not in scope yet)

### Phase 2: Skills/Rules Layer

**Problem:** Model can hallucinate bad combinations even within valid recipes.
- Example: "Modak with peanut butter + wasabi" (valid ingredients, nonsensical combo)
- Example: Turmeric + dairy curdles in some contexts

**Solution:** Culinary expert rules define what works together.

```
Schema (in D1):
- compatibility(ingredient_a, ingredient_b, cuisine) → valid/invalid/warning
- substitution(original, replacement, cuisine, condition)
- dish_rules(dish_name, rule, notes)

Example rules:
- (coconut, sugar) → valid (Modak filling)
- (turmeric, dairy, South Indian) → warning ("use ghee, not milk")
- (Modak, "filling_type") → "sweet XOR savory, never both"
```

**Flow:**
```
Model generates variant → Validate against skills → Accept or ask model to adjust
```

### Phase 3: Chef-Curated Recipe Database + RAG

**Problem:** Web search is unreliable; we need authoritative recipes.

**Solution:** Chefs pre-test and approve recipes, store in R2, use RAG to ground model output.

```
R2 structure:
/recipes/modak/
  - modak_traditional.json
  - modak_vegan.json
  - modak_gluten_free.json
  metadata: {chef: "...", tested_date: "...", allergies_tested: [...]}

RAG flow:
1. User: "Modak for vegan diet"
2. Retrieve similar recipes from R2 (Modak family + vegan variants)
3. Pass to model: "Here are tested Modak recipes. Adapt for user's allergies."
4. Model grounds output in real examples, reduces hallucination
```

**Benefits:**
- Recipes are vetted (safe, practical)
- Model adapts existing recipes, not inventing
- Scalable: more recipes in R2 = smarter system
- Institutional knowledge: chefs build database over time

### Phase 4: Chef Dashboard

UI for culinary experts to:
- Submit tested recipes
- Define skills/rules
- Mark allergen testing
- Approve user variants

---

## Architecture Decision: No Vectorize (For Now)

**Considered:** Vectorize for semantic recipe search (find "creamy tomato pasta" when user searches "white sauce").

**Decision:** Skip for now.
- Adds cost ($0.02–0.10 per 1k embeddings)
- Adds latency
- Better solved by indexed recipe database (Phase 3)
- Current web search fallback is "good enough" for unknown recipes

**Revisit when:** Query volume justifies embedding storage + inference cost.

---

## Why Not "Let the Model Invent"?

Recipes are **practical, empirical knowledge**, not creative content.

| Aspect | Image Gen | Recipe Gen |
|--------|-----------|-----------|
| **Hallucination cost** | Weird artifacts (cosmetic) | Wrong methods, unsafe allergen combos, inedible results |
| **Domain expertise** | Artist-like creativity is the goal | Precise technique + food science required |
| **Validation** | "Does it look good?" (subjective) | "Does it work?" (testable, safety-critical) |
| **Failure mode** | Entertaining error | Wasted ingredients, food poisoning |

Conclusion: Model's job is **understanding intent** and **personalizing existing recipes**, not inventing from scratch.

---

## Current State

- ✅ Phase 1 complete: model gen + web search fallback + caching
- ⏳ Phase 2: waiting for chef expert input + culinary rules
- ⏳ Phase 3: requires chef database setup + R2 infrastructure
- ⏳ Phase 4: chef dashboard UX design
