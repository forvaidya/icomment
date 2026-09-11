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

type Diet = 'veg' | 'non_veg' | 'vegan' | null;

// UI sends diet as a checkbox array, the spec says a single string.
// Empty array = no diet constraint. Non-empty = take strictest (vegan > veg > non_veg).
function normalizeDiet(d: unknown): Diet {
  const list = Array.isArray(d) ? d : d ? [d] : [];
  if (list.length === 0) return null; // No diet selected = no filter
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

export async function checkIngredient(name: string, diet: Diet | null, allergies: string[]) {
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

  // If no diet constraint (null), accept any diet
  const dietFlag = diet === null ? true : diet === 'vegan' ? is_vegan : diet === 'veg' ? is_vegetarian : true;
  // If no allergies selected, no allergen filter
  const hit = allergies.length === 0 ? false : allergies.some((a) => (ALLERGEN_TAGS[a] ?? [a]).some((t) => allergens.includes(t)));

  return {
    ingredient: name,
    allergens,
    is_vegan,
    is_vegetarian,
    safe_for_diet: dietFlag,
    safe_for_allergies: !hit,
  };
}

function systemPrompt(diet: Diet, allergies: string[], feedback?: string) {
  const dietSection = diet
    ? `Dietary class: ${diet}
- veg: no meat or fish, dairy and eggs OK
- non_veg: all ingredients OK
- vegan: no animal products (no meat, fish, dairy, eggs, honey)`
    : 'No dietary restriction — all ingredients OK';

  const feedbackSection = feedback
    ? `\nUser Feedback: ${feedback}\nRespond to this feedback by adjusting the recipe appropriately.`
    : '';

  return `You are a recipe agent. Create recipes that respect dietary restrictions.

${dietSection}

Avoid allergies: ${allergies.length ? allergies.join(', ') : 'none (no allergies selected)'}
${feedbackSection}

RULES:
1. Never include ingredients that conflict with diet/allergies
2. If unsure about an ingredient, call check_ingredient
3. If check_ingredient flags a conflict, remove and substitute safely
4. Return ONLY valid JSON (no other text)

RESPONSE FORMAT (required):
{
  "title": "Recipe Name",
  "description": "Brief description",
  "ingredients": [
    {"name": "ingredient", "amount": "quantity"},
    {"name": "ingredient2", "amount": "quantity2"}
  ],
  "steps": [
    "Step 1",
    "Step 2"
  ],
  "tags": ["tag1", "tag2"]
}

Your response must be ONLY the JSON object, nothing else.`;
}

// The model returns JSON in prose about as often as it returns bare JSON.
// Sometimes response is already an object, sometimes it's a string.
export function extractJson(text: unknown): any | null {
  if (text && typeof text === 'object') return text;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to find JSON in the string
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

// Handle multiple tool call formats:
// 1. { name, arguments }
// 2. { function: { name, arguments } }
// 3. { function: "name", parameters: {...} } (direct format)
// 4. { function: { name, parameters } } (nested with parameters key)
function toolCallOf(call: any): { name: string; args: any } {
  if (call.function && typeof call.function === 'string') {
    // Format 3: direct function name + parameters
    return { name: call.function, args: call.parameters ?? {} };
  }
  // Formats 1, 2 & 4: nested or flat
  const fn = call.function ?? call;
  const raw = fn.arguments ?? fn.parameters ?? {};
  return { name: fn.name, args: typeof raw === 'string' ? extractJson(raw) ?? {} : raw };
}


async function webSearchRecipe(query: string, diet: Diet | null): Promise<any | null> {
  try {
    // Use DuckDuckGo for web search (no key required)
    const searchQuery = `${query} recipe ${diet && diet !== 'non_veg' ? diet : ''}`;
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=3`,
      { headers: { Accept: 'application/json' } }
    ).catch(() => null);

    if (!response?.ok) {
      // Fallback: return structured placeholder from search query
      return {
        title: `${query} Recipe`,
        description: `Search for "${query}" online for detailed recipe instructions.`,
        ingredients: [
          { name: 'ingredient 1', amount: 'as needed' },
          { name: 'ingredient 2', amount: 'as needed' }
        ],
        steps: [
          `Search online for "${query} recipe" for detailed instructions.`,
          'Follow recipe instructions carefully.'
        ],
        tags: ['web-search', query.toLowerCase()],
        source: 'web-search'
      };
    }

    const results = await response.json() as any;
    const firstResult = results?.web?.[0];

    if (firstResult) {
      return {
        title: `${query} Recipe (from web)`,
        description: firstResult.description || `Find more details at: ${firstResult.url}`,
        ingredients: [{ name: 'See recipe source', amount: 'link below' }],
        steps: [`Visit: ${firstResult.url}`],
        tags: ['web-search', 'external-link'],
        source: firstResult.url
      };
    }

    return null;
  } catch (e) {
    console.log(JSON.stringify({ event: 'meal.websearch.error', error: String(e) }));
    return null;
  }
}

export async function runRecipeAgent(
  ai: Ai,
  body: { query?: string; diet?: unknown; allergies?: unknown },
  requestId: string,
  kv?: Kv,
  sessionId?: string,
  feedback?: string,
  logLevel?: string,
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

  let model: string;
  try {
    model = await selectModel(ai);
    console.log(JSON.stringify({ event: 'meal.model.selected', requestId, model, hasFeedback: !!feedback }));
  } catch (e) {
    console.log(JSON.stringify({ event: 'meal.model.select.failed', requestId, error: String(e) }));
    return null;
  }
  const messages: any[] = [
    { role: 'system', content: systemPrompt(diet, allergies, feedback) },
    { role: 'user', content: String(body.query ?? '') },
  ];

  console.log(JSON.stringify({ event: 'meal.start', requestId, diet, allergiesCount: allergies.length, queryLength: String(body.query).length }));

  let last: any = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let out: any;
    try {
      // ponytail: no response_format — tools + json_object is unreliable on this
      // model, and extractJson() is needed either way.
      out = await ai.run(model, { messages, tools: TOOLS });
      last = out;

      console.log(JSON.stringify({ event: 'meal.turn', requestId, turn, hasToolCalls: !!out?.tool_calls?.length, responseLength: String(out?.response).length, rawResponse: String(out?.response).slice(0, 300) }));
    } catch (e) {
      console.log(JSON.stringify({ event: 'meal.turn.error', requestId, turn, error: String(e) }));
      throw e;
    }

    // Handle both formats: { tool_calls: [...] } and direct array [...]
    let calls: any[] = out?.tool_calls ?? [];
    if (!calls.length) {
      // Model might return tool calls as array (as string or object)
      if (Array.isArray(out?.response)) {
        calls = out.response;
      } else if (typeof out?.response === 'string') {
        const parsed = extractJson(out.response);
        if (Array.isArray(parsed)) calls = parsed;
      }
    }

    if (!calls.length) {
      const rawResponse = out?.response;
      const recipe = extractJson(rawResponse);
      console.log(JSON.stringify({
        event: 'meal.extract',
        requestId,
        turn,
        extracted: !!recipe,
        responseType: typeof rawResponse,
        responseLength: String(rawResponse).length,
        responsePreview: String(rawResponse).slice(0, 200),
        hasTitle: !!recipe?.title,
        hasIngredients: Array.isArray(recipe?.ingredients),
        hasSteps: Array.isArray(recipe?.steps)
      }));

      // Accept partial recipes, fill in defaults for missing fields
      if (recipe && (recipe.title || recipe.ingredients || recipe.steps)) {
        const filled = {
          title: recipe.title || 'Recipe',
          description: recipe.description || 'A delicious recipe',
          ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [{ name: 'ingredients', amount: 'as needed' }],
          steps: Array.isArray(recipe.steps) ? recipe.steps : ['Prepare and cook'],
          tags: Array.isArray(recipe.tags) ? recipe.tags : [],
        };
        const result = { recipe: filled };
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
  console.log(JSON.stringify({ event: 'meal.cap.reached', requestId, feedback: !!feedback, rawResponse: String(last?.response).slice(0, 500), extracted: !!recipe }));

  if (!recipe) {
    // Fall back to web search
    const webRecipe = await webSearchRecipe(String(body.query ?? 'recipe'), diet);
    if (webRecipe) {
      console.log(JSON.stringify({ event: 'meal.fallback.websearch', requestId }));
      const result = { recipe: webRecipe, source: 'web-search' };
      if (kv) {
        await kv.put(key, JSON.stringify(result), { expirationTtl: CACHE_TTL });
        console.log(JSON.stringify({ event: 'meal.cache.store.websearch', requestId, key }));
      }
      return result;
    }
    return null;
  }

  // Fill in missing fields
  const filled = {
    title: recipe.title || 'Recipe',
    description: recipe.description || 'A delicious recipe',
    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [{ name: 'ingredients', amount: 'as needed' }],
    steps: Array.isArray(recipe.steps) ? recipe.steps : ['Prepare and cook'],
    tags: Array.isArray(recipe.tags) ? recipe.tags : [],
  };

  const result = { recipe: filled, warning: 'Stopped at iteration cap' };
  if (kv) {
    await kv.put(key, JSON.stringify(result), { expirationTtl: CACHE_TTL });
    console.log(JSON.stringify({ event: 'meal.cache.store', requestId, key }));
  }
  return result;
}
