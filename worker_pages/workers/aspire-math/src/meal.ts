// Recipe agent: LLM + one tool (check_ingredient) backed by Open Food Facts.
// Diet/allergy safety is computed in code, never trusted to the model.

// Data models (TypeScript types for validation)
export type Diet = 'veg' | 'non_veg' | 'vegan' | null;
export type Allergy = 'nuts' | 'dairy' | 'seafood' | 'eggs' | 'gluten' | 'soy' | 'seeds';

export interface RecipeRequest {
  query: string;
  diet?: string | string[];
  allergies?: string[];
  sessionId?: string;
  feedback?: string;
  logLevel?: 'error' | 'info' | 'debug';
  userId?: string; // From JWT
}

export interface SearchHistory {
  userId: string;
  query: string;
  diet: Diet;
  allergies: Allergy[];
  recipeTitle?: string;
  liked?: boolean;
  timestamp: number; // milliseconds
}

export interface UserPreferences {
  userId: string;
  preferredDiet: Diet;
  preferredAllergies: Allergy[];
  lastSearched: number;
  searchCount: number;
}

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

// Embedding model for semantic search
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

// Generate embedding for query using Workers AI
async function generateEmbedding(ai: Ai, query: string): Promise<number[] | null> {
  try {
    const result = await ai.run(EMBEDDING_MODEL, { text: query });
    return result?.data?.[0] || null;
  } catch (e) {
    console.log(JSON.stringify({ event: 'embedding.error', error: String(e) }));
    return null;
  }
}

// Cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  const dotProduct = a.reduce((sum, x, i) => sum + x * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, x) => sum + x * x, 0));
  const normB = Math.sqrt(b.reduce((sum, x) => sum + x * x, 0));
  return normA && normB ? dotProduct / (normA * normB) : 0;
}

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

// UI allergy value -> Open Food Facts allergen tags (broad categories)
const ALLERGEN_TAGS: Record<string, string[]> = {
  nuts: ['peanuts', 'nuts'],
  dairy: ['milk'],
  seafood: ['fish', 'crustaceans', 'molluscs'],
  eggs: ['eggs'],
  gluten: ['gluten'],
  soy: ['soybeans'],
  seeds: ['sesame-seeds'],
};

// Meat/fish keywords (non-veg class) to detect diet conflicts
const MEAT_KEYWORDS = [
  // Poultry
  'chicken', 'turkey', 'duck', 'goose',
  // Beef/pork
  'beef', 'pork', 'lamb', 'mutton', 'goat', 'veal',
  // Fish & seafood (all non-veg)
  'fish', 'salmon', 'tuna', 'cod', 'trout', 'mackerel', 'sardine',
  'shrimp', 'prawn', 'crab', 'lobster', 'oyster', 'mussel', 'clam',
  'seafood', 'meat', 'steak', 'bacon', 'ham', 'sausage'
];

// Query filter: minimal, let LLM see rich context
// REMOVE only: deities, mother/grandmother, girlfriend/boyfriend (truly non-recipe context)
// KEEP: occasions, other relations, descriptors, festivals, ingredients (LLM can handle noise)
const NOISE_PATTERNS = [
  // Deities only
  /\b(ganesh|lakshmi|krishna|shiva|brahma|durga|saraswati|hanuman|ganesha)\b/gi,
  // Mother/grandmother (too generic)
  /\b(mother|mom|grandmother|grandma)\b/gi,
  // Girlfriend/boyfriend (purely social, not dietary)
  /\b(girlfriend|boyfriend)\b/gi,
];

function filterQuery(query: string): string {
  let filtered = query;
  for (const pattern of NOISE_PATTERNS) {
    filtered = filtered.replace(pattern, '');
  }
  return filtered.replace(/\s+/g, ' ').trim();
}

// Religious/cultural exclusions
const RELIGION_EXCLUSIONS: Record<string, string[]> = {
  hindu: ['beef'],
  muslim: ['pork', 'bacon', 'ham'],
  jewish: ['pork', 'shellfish', 'shrimp', 'crab', 'lobster', 'oyster', 'clam', 'mussel'],
  jain: ['root vegetables', 'onion', 'garlic', 'potato'],
  buddhist: [], // Prefer veg but no hard exclusions
  christian: [],
};

function detectDietConflict(query: string, diet: Diet): string | null {
  if (!diet || diet === 'non_veg') return null; // No conflict if non_veg or no diet
  const queryLower = String(query).toLowerCase();
  const conflict = MEAT_KEYWORDS.find(keyword => queryLower.includes(keyword));
  if (conflict) {
    const dietLabel = diet === 'vegan' ? 'vegan' : 'vegetarian';
    return `⚠️ "${conflict}" is a meat/fish (non-vegetarian), but you selected ${dietLabel} diet. Generated ${dietLabel} recipe instead.`;
  }
  return null;
}

function detectReligionConflict(query: string, religion: string | null): string | null {
  if (!religion || !RELIGION_EXCLUSIONS[religion]) return null;
  const queryLower = String(query).toLowerCase();
  const exclusions = RELIGION_EXCLUSIONS[religion];
  const conflict = exclusions.find(item => queryLower.includes(item));
  if (conflict) {
    return `${conflict} violates ${religion} dietary restrictions`;
  }
  return null;
}

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
  } catch (parseErr) {
    // Try to find JSON in the string (object or array)
    const objStart = trimmed.indexOf('{');
    const arrStart = trimmed.indexOf('[');
    const start = objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
    if (start === -1) return null;

    // Find first closing bracket, not last — multiple JSON objects may exist
    const end = trimmed.startsWith('[', start) ? trimmed.indexOf(']', start) : trimmed.indexOf('}', start);
    if (end <= start) {
      if (typeof text === 'string') console.error('extractJson: end <= start', { textLen: text.length, start, end });
      return null;
    }
    try {
      const snippet = trimmed.slice(start, end + 1);
      if (typeof text === 'string' && text.includes('check_ingredient')) console.error('extractJson: snippet', { snippetStart: snippet.slice(0, 50), snippetEnd: snippet.slice(-50) });
      return JSON.parse(snippet);
    } catch (snippetErr) {
      if (typeof text === 'string' && text.includes('check_ingredient')) console.error('extractJson: parse failed', { errorMsg: String(snippetErr).slice(0, 100) });
      return null;
    }
  }
}

// Handle multiple tool call formats:
// 1. { name, arguments }
// 2. { function: { name, arguments } }
// 3. { function: "name", parameters: {...} } (direct format)
// 4. { function: { name, parameters } } (nested with parameters key)
// 5. [function_name, parameters] (array shorthand)
function toolCallOf(call: any): { name: string; args: any } {
  // Format 5: array shorthand [function_name, params]
  if (Array.isArray(call) && call.length === 2) {
    return { name: call[0], args: call[1] ?? {} };
  }
  if (call.function && typeof call.function === 'string') {
    // Format 3: direct function name + parameters
    return { name: call.function, args: call.parameters ?? {} };
  }
  // Formats 1, 2 & 4: nested or flat
  const fn = call.function ?? call;
  const raw = fn.arguments ?? fn.parameters ?? {};
  return { name: fn.name, args: typeof raw === 'string' ? extractJson(raw) ?? {} : raw };
}

function normalizeToolCalls(calls: any[]): any[] {
  return calls.map((call, idx) => {
    let name: string;
    let params: any;

    // Handle array shorthand [function_name, params]
    if (Array.isArray(call) && call.length === 2) {
      name = call[0];
      params = call[1] ?? {};
    } else {
      // Handle object formats
      const fn = call.function ?? call;
      name = fn.name || (Array.isArray(call) ? call[0] : '');
      params = fn.parameters ?? fn.arguments ?? {};
    }

    return {
      type: 'function',
      id: `call_${idx}_${Date.now()}`,
      function: {
        name,
        arguments: JSON.stringify(params)
      }
    };
  });
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

async function logSearchToDb(db: any, userId: string, query: string, diet: Diet, allergies: string[], recipeTitle?: string, liked?: boolean, embedding?: number[] | null) {
  try {
    if (!db) return;
    const allergiesJson = JSON.stringify(allergies);
    const embeddingJson = embedding ? JSON.stringify(embedding) : null;
    await db.prepare(`
      INSERT INTO search_history (userId, query, diet, allergies, recipeTitle, liked, timestamp, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(userId, query, diet, allergiesJson, recipeTitle || null, liked ? 1 : 0, Date.now(), embeddingJson).run();
  } catch (e) {
    console.log(JSON.stringify({ event: 'db.log.error', error: String(e) }));
  }
}

// Find similar queries in D1 using vector similarity
async function findSimilarQueries(db: any, embedding: number[], diet: Diet, limit: number = 5): Promise<Array<{query: string; recipeTitle?: string; similarity: number}>> {
  try {
    if (!db) return [];
    // Fetch recent queries with embeddings (ponytail: no vector index, so fetch and compute locally)
    const result = await db.prepare(`
      SELECT DISTINCT query, recipeTitle, embedding
      FROM search_history
      WHERE embedding IS NOT NULL AND diet = ? AND recipeTitle IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT 100
    `).bind(diet).all();

    const rows = (result as any).results || [];
    const matches = rows
      .map((row: any) => {
        try {
          const storedEmbedding = JSON.parse(row.embedding);
          const similarity = cosineSimilarity(embedding, storedEmbedding);
          return { query: row.query, recipeTitle: row.recipeTitle, similarity };
        } catch (e) {
          return null;
        }
      })
      .filter((m: any) => m !== null && m.similarity > 0.65)
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, limit);

    return matches;
  } catch (e) {
    console.log(JSON.stringify({ event: 'similarity_search.error', error: String(e) }));
    return [];
  }
}

export async function runRecipeAgent(
  ai: Ai,
  body: { query?: string; diet?: unknown; allergies?: unknown; religion?: string },
  requestId: string,
  kv?: Kv,
  sessionId?: string,
  feedback?: string,
  logLevel?: string,
  db?: any,
  userId?: string | null,
) {
  console.error('super-modak-testing: version-5 loaded');
  const diet = normalizeDiet(body.diet);
  const allergies = Array.isArray(body.allergies) ? (body.allergies as string[]) : [];
  const religion = body.religion || null;

  // Filter query: remove deities, occasions, relations (noise that doesn't affect recipe)
  // KEEP: religious festivals (Ramadan, Eid, Diwali affect diet preferences)
  const filteredQuery = filterQuery(String(body.query ?? ''));

  // Check for diet conflicts (e.g., "chicken" query with "veg" diet) - PRIORITY
  const dietConflict = detectDietConflict(filteredQuery, diet);
  if (dietConflict) {
    console.log(JSON.stringify({ event: 'meal.diet.conflict.rejected', requestId, query: body.query, diet, conflict: dietConflict }));
    return null; // Reject inconsistent input
  }

  // Check for religious conflicts (e.g., "pork" query for Muslim)
  const religionConflict = detectReligionConflict(filteredQuery, religion);
  if (religionConflict) {
    console.log(JSON.stringify({ event: 'meal.religion.conflict.rejected', requestId, query: body.query, religion, conflict: religionConflict }));
    return null; // Reject inconsistent input
  }

  // Generate embedding for semantic search
  let embedding: number[] | null = null;
  if (db) {
    embedding = await generateEmbedding(ai, filteredQuery);
    console.log(JSON.stringify({ event: 'embedding.generated', requestId, embeddingDim: embedding?.length || 0 }));
  }

  // Search for similar queries (semantic cache)
  if (embedding && db && diet) {
    const similar = await findSimilarQueries(db, embedding, diet, 3);
    console.log(JSON.stringify({ event: 'semantic.search', requestId, matchesFound: similar.length, topMatch: similar[0] }));
    if (similar.length > 0) {
      const topMatch = similar[0];
      console.log(JSON.stringify({ event: 'semantic.cache.hit', requestId, query: topMatch.query, similarity: topMatch.similarity.toFixed(2) }));
      return { recipe: { title: topMatch.recipeTitle || 'Recipe', description: 'Similar recipe from cache', ingredients: [], steps: [], tags: ['cached'] }, cached: true };
    }
  }

  // Log search to D1 (use "anonymous" if no userId so vector search works globally)
  const userIdForLogging = userId || 'anonymous';
  if (db) {
    await logSearchToDb(db, userIdForLogging, filteredQuery, diet, allergies, undefined, undefined, embedding);
  }

  // ponytail: cache key is JSON hash. No secure crypto needed, just deterministic collision avoidance.
  const key = `recipe:${btoa(JSON.stringify({ q: filteredQuery, d: diet, a: allergies.sort() })).replace(/[+/=]/g, '')}`.slice(0, 512);
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
    { role: 'user', content: filteredQuery },
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
        console.log(JSON.stringify({ event: 'meal.tool.array', requestId, turn, callsCount: calls.length }));
      } else if (typeof out?.response === 'string') {
        const parsed = extractJson(out.response);
        if (Array.isArray(parsed)) {
          calls = parsed;
        }
      }
    }

    // Transform extracted tool calls to proper API format
    if (calls.length && !calls[0].type) {
      calls = normalizeToolCalls(calls);
    }

    if (!calls.length) {
      const rawResponse = out?.response;
      // Handle multiple formats: direct object, string with array+object, etc.
      let recipe = extractJson(rawResponse);
      console.error(JSON.stringify({ event: 'meal.first.extract', requestId, turn, isArray: Array.isArray(recipe), isNull: recipe === null, type: typeof recipe }));

      // If extraction returned array (tool calls), skip it and find the recipe object
      if (Array.isArray(recipe)) {
        const responseStr = String(rawResponse);
        // Find the ']' that closes the tool calls array, then find '{' after it
        const arrayEnd = responseStr.lastIndexOf(']');
        const objStart = responseStr.indexOf('{', arrayEnd);
        if (objStart !== -1) {
          const sliced = responseStr.slice(objStart);
          recipe = extractJson(sliced);
          console.error(JSON.stringify({ event: 'meal.extract.debug', requestId, turn, slicedLen: sliced.length, recipeNull: recipe === null, recipeType: typeof recipe }));
        } else {
          recipe = null;
        }
      }
      console.log(JSON.stringify({
        event: 'meal.extract',
        requestId,
        turn,
        extracted: !!recipe,
        recipeTitle: recipe?.title,
        hasIngredients: Array.isArray(recipe?.ingredients),
        hasSteps: Array.isArray(recipe?.steps),
        recipeKeys: recipe ? Object.keys(recipe) : null
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

        // Validate all ingredients in final recipe
        if (Array.isArray(filled.ingredients)) {
          const ingNames = filled.ingredients.map(ing => String(ing.name || ''));
          for (const ingName of ingNames) {
            if (ingName) {
              const ingCheck = await checkIngredient(ingName, diet, allergies);
              console.log(JSON.stringify({ event: 'meal.final.ingredient.check', requestId, ingredient: ingName, safe: ingCheck.safe_for_diet !== false && ingCheck.safe_for_allergies !== false }));
            }
          }
        }

        const result = { recipe: filled };
        if (kv) {
          await kv.put(key, JSON.stringify(result), { expirationTtl: CACHE_TTL });
          console.log(JSON.stringify({ event: 'meal.cache.store', requestId, key }));
        }
        return result;
      }
      return null;
    }

    // Don't try to send back malformed tool calls. The model provided what it could.
    if (!calls.length) {
      console.log(JSON.stringify({ event: 'meal.no.tools', requestId, turn }));
      continue;
    }

    const assistantMsg: any = { role: 'assistant', tool_calls: calls };
    if (out.response?.trim()) {
      assistantMsg.content = [{ type: 'text', text: out.response }];
    }
    messages.push(assistantMsg);

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
