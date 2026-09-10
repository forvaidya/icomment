// Recipe agent: LLM + one tool (check_ingredient) backed by Open Food Facts.
// Diet/allergy safety is computed in code, never trusted to the model.

export interface Ai {
  run(model: string, input: unknown): Promise<any>;
}

export interface Kv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

// Model fallback chain: try newer models first, fall back to stable ones
// Last checked: Sept 10, 2026 — see https://developers.cloudflare.com/workers-ai/models/
const MODEL_CHAIN = [
  '@cf/meta/llama-4-scout-17b-16e-instruct', // Newest, better quality (if available)
  '@cf/meta/llama-3-8b-instruct',             // Stable, good balance
  '@cf/mistral/mistral-7b-instruct',          // Fallback
];

let cachedModel: string | null = null;

// ponytail: lazy init, try models until one works. Cache the winner.
async function selectModel(ai: Ai): Promise<string> {
  if (cachedModel) return cachedModel;

  for (const model of MODEL_CHAIN) {
    try {
      await ai.run(model, { messages: [{ role: 'user', content: 'x' }] });
      cachedModel = model;
      return model;
    } catch (e) {
      const err = String(e);
      if (err.includes('5028') || err.includes('deprecated') || err.includes('not found')) {
        continue;
      }
      throw e;
    }
  }
  throw new Error(`No working model in ${MODEL_CHAIN.join(', ')}`);
}
const MAX_TURNS = 5;
const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days

type Diet = 'veg' | 'non_veg' | 'vegan';

// UI sends diet as a checkbox array, the spec says a single string. Accept both
// and take the strictest selection.
function normalizeDiet(d: unknown): Diet {
  const list = Array.isArray(d) ? d : [d];
  if (list.includes('vegan')) return 'vegan';
  if (list.includes('veg')) return 'veg';
  return 'non_veg';
}

// UI allergy value -> Open Food Facts allergen tags.
const ALLERGEN_TAGS: Record<string, string[]> = {
  peanuts: ['peanuts'],
  tree_nuts: ['nuts'],
  dairy: ['milk'],
  shellfish: ['crustaceans', 'molluscs'],
  eggs: ['eggs'],
  wheat: ['gluten'],
  soy: ['soybeans'],
  sesame: ['sesame-seeds'],
  fish: ['fish'],
};

const TOOLS = [{
  type: 'function',
  function: {
    name: 'check_ingredient',
    description: 'Check if an ingredient is safe for a given diet and allergy set. Returns allergen flags and diet compatibility.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Ingredient name to check' },
      },
      required: ['name'],
    },
  },
}];

export async function checkIngredient(name: string, diet: Diet, allergies: string[]) {
  let allergens: string[];
  let is_vegan: boolean | null;
  let is_vegetarian: boolean | null;

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name)}&json=1&page_size=1`,
      { headers: { 'User-Agent': 'aspire-recipe-agent/1.0' } },
    );
    if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);

    const product = ((await res.json()) as any)?.products?.[0];
    if (!product) throw new Error('no matching product');

    const strip = (t: string) => String(t).replace(/^[a-z]{2}:/, '');
    allergens = (product.allergens_tags ?? []).map(strip);
    const analysis: string[] = product.ingredients_analysis_tags ?? [];
    is_vegan = analysis.includes('en:vegan') ? true : analysis.includes('en:non-vegan') ? false : null;
    is_vegetarian = analysis.includes('en:vegetarian') ? true : analysis.includes('en:non-vegetarian') ? false : null;
  } catch {
    return {
      ingredient: name,
      allergens: [],
      is_vegan: null,
      is_vegetarian: null,
      safe_for_diet: null,
      safe_for_allergies: null,
      warning: 'Could not verify',
    };
  }

  const dietFlag = diet === 'vegan' ? is_vegan : diet === 'veg' ? is_vegetarian : true;
  const hit = allergies.some((a) => (ALLERGEN_TAGS[a] ?? [a]).some((t) => allergens.includes(t)));

  return {
    ingredient: name,
    allergens,
    is_vegan,
    is_vegetarian,
    safe_for_diet: dietFlag,
    safe_for_allergies: !hit,
  };
}

function systemPrompt(diet: Diet, allergies: string[]) {
  return `You are a recipe agent. You help users find or create recipes that respect their dietary restrictions.

Dietary class: ${diet}
- veg: no meat or fish, dairy and eggs are allowed
- non_veg: all ingredients allowed
- vegan: no animal products whatsoever (no meat, fish, dairy, eggs, honey)

Allergies to avoid: ${allergies.length ? allergies.join(', ') : 'none'}

Rules:
1. Never include any ingredient that conflicts with the diet or allergies
2. If you are unsure whether an ingredient is safe, call the check_ingredient tool to verify it
3. If check_ingredient reveals a conflict, remove that ingredient and substitute a safe alternative
4. Always return the final recipe as structured JSON with fields: title, description, ingredients (array of {name, amount}), steps (array of strings), tags (array of strings like 'vegan', 'nut-free', 'high-protein')
5. Keep recipes practical — ingredients should be commonly available
6. Yield 2-4 servings`;
}

// The model returns JSON in prose about as often as it returns bare JSON.
export function extractJson(text: unknown): any | null {
  if (text && typeof text === 'object') return text;
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

// Workers AI emits { name, arguments }; OpenAI-style is { function: { name, arguments } }.
function toolCallOf(call: any): { name: string; args: any } {
  const fn = call.function ?? call;
  const raw = fn.arguments ?? {};
  return { name: fn.name, args: typeof raw === 'string' ? extractJson(raw) ?? {} : raw };
}


export async function runRecipeAgent(
  ai: Ai,
  body: { query?: string; diet?: unknown; allergies?: unknown },
  requestId: string,
  kv?: Kv,
) {
  const diet = normalizeDiet(body.diet);
  const allergies = Array.isArray(body.allergies) ? (body.allergies as string[]) : [];

  // ponytail: cache key is JSON hash. No secure crypto needed, just deterministic collision avoidance.
  const key = `recipe:${btoa(JSON.stringify({ q: body.query, d: diet, a: allergies.sort() })).replace(/[+/=]/g, '')}`.slice(0, 512);
  if (kv) {
    const cached = await kv.get(key);
    if (cached) {
      console.log(JSON.stringify({ event: 'meal.cache.hit', requestId, key }));
      return JSON.parse(cached);
    }
  }

  const model = await selectModel(ai);
  console.log(JSON.stringify({ event: 'meal.model.selected', requestId, model }));

  const messages: any[] = [
    { role: 'system', content: systemPrompt(diet, allergies) },
    { role: 'user', content: String(body.query ?? '') },
  ];

  let last: any = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // ponytail: no response_format — tools + json_object is unreliable on this
    // model, and extractJson() is needed either way.
    const out = await ai.run(model, { messages, tools: TOOLS });
    last = out;

    const calls: any[] = out?.tool_calls ?? [];
    if (!calls.length) {
      const recipe = extractJson(out?.response);
      if (recipe?.title && recipe?.ingredients && recipe?.steps) {
        const result = { recipe };
        if (kv) {
          await kv.put(key, JSON.stringify(result), { expirationTtl: CACHE_TTL });
          console.log(JSON.stringify({ event: 'meal.cache.store', requestId, key }));
        }
        return result;
      }
      return null;
    }

    messages.push({ role: 'assistant', content: out.response ?? '', tool_calls: calls });
    for (const call of calls) {
      const { name, args } = toolCallOf(call);
      const result = name === 'check_ingredient'
        ? await checkIngredient(String(args.name ?? ''), diet, allergies)
        : { error: `unknown tool ${name}` };
      console.log(JSON.stringify({ event: 'meal.tool.call', requestId, turn, tool: name, result }));
      messages.push({ role: 'tool', name, content: JSON.stringify(result) });
    }
  }

  // Turn cap hit — hand back whatever the model last produced.
  const recipe = extractJson(last?.response);
  if (!recipe) return null;
  const result = { recipe, warning: 'Stopped at iteration cap' };
  if (kv) {
    await kv.put(key, JSON.stringify(result), { expirationTtl: CACHE_TTL });
    console.log(JSON.stringify({ event: 'meal.cache.store', requestId, key }));
  }
  return result;
}
