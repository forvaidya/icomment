// Run: cd worker_pages/workers/aspire-math && npx tsx src/meal.test.ts
import assert from 'node:assert';
import { checkIngredient, extractJson, runRecipeAgent } from './meal';

const off = (product: unknown) => async () =>
  new Response(JSON.stringify({ products: product ? [product] : [] }));

const mockKv = () => {
  const store: Record<string, string> = {};
  return {
    async get(k: string) { return store[k] ?? null; },
    async put(k: string, v: string) { store[k] = v; },
  };
};

async function main() {
  const realFetch = globalThis.fetch;

  // Allergen hit is computed in code, not left to the model.
  globalThis.fetch = off({ allergens_tags: ['en:milk'], ingredients_analysis_tags: ['en:vegetarian'] }) as any;
  let r = await checkIngredient('butter', 'veg', ['dairy']);
  assert.equal(r.safe_for_allergies, false);
  assert.equal(r.safe_for_diet, true, 'vegetarian butter is fine on a veg diet');

  // Same product, vegan diet -> diet conflict.
  r = await checkIngredient('butter', 'vegan', []);
  assert.equal(r.safe_for_diet, null, 'no vegan tag either way -> unknown');

  globalThis.fetch = off({ ingredients_analysis_tags: ['en:non-vegan'] }) as any;
  assert.equal((await checkIngredient('honey', 'vegan', [])).safe_for_diet, false);

  // Unreachable API -> warning fallback, nulls not false.
  globalThis.fetch = (async () => { throw new Error('offline'); }) as any;
  r = await checkIngredient('tofu', 'vegan', ['soy']) as any;
  assert.equal(r.warning, 'Could not verify');
  assert.equal(r.safe_for_allergies, null);

  globalThis.fetch = realFetch;

  assert.deepEqual(extractJson('Here you go:\n{"a":1}\nEnjoy!'), { a: 1 });
  assert.equal(extractJson('no json here'), null);

  // Agent loop: one tool round trip, then a final recipe.
  globalThis.fetch = off({ allergens_tags: [], ingredients_analysis_tags: ['en:vegan'] }) as any;
  let loopTurns = 0;
  const loopAi = {
    async run(_m: string, input: any) {
      loopTurns++;
      // selectModel does a test call (loopTurns === 1), skip it and count real loop
      if (loopTurns === 1) return { response: '', tool_calls: [] }; // selectModel test
      if (loopTurns === 2) return { response: '', tool_calls: [{ name: 'check_ingredient', arguments: { name: 'tofu' } }] };
      assert.ok(input.messages.some((m: any) => m.role === 'tool'), 'tool result fed back');
      return { response: '{"title":"Tofu Bowl","description":"d","ingredients":[{"name":"tofu","amount":"200g"}],"steps":["cook"],"tags":["vegan"]}' };
    },
  };
  const out = await runRecipeAgent(loopAi, { query: 'tofu dinner', diet: ['vegan'], allergies: [] }, 'test1');
  assert.equal(out?.recipe.title, 'Tofu Bowl');
  assert.equal(loopTurns, 3); // test call + 2 real loop iterations

  // A model that only ever calls tools stops at the cap instead of spinning.
  turns = 0;
  const looper = { async run() { turns++; return { response: '', tool_calls: [{ name: 'check_ingredient', arguments: { name: 'x' } }] }; } };
  assert.equal(await runRecipeAgent(looper, { query: 'x', diet: 'veg', allergies: [] }, 'test'), null);
  assert.equal(turns, 5);

  globalThis.fetch = realFetch;

  // Cache: cache hit skips the agent loop.
  globalThis.fetch = off({ allergens_tags: [], ingredients_analysis_tags: ['en:vegan'] }) as any;
  let runCount = 0;
  const aiWithCount = {
    async run(model: string, input: any) {
      const chain = [
        '@cf/meta/llama-4-scout-17b-16e-instruct',
        '@cf/meta/llama-3-8b-instruct',
        '@cf/mistral/mistral-7b-instruct',
      ];
      if (!chain.includes(model)) throw new Error(`model not in chain: ${model}`);
      runCount++;
      // Second call should have tool messages fed back
      if (runCount === 2) {
        assert.ok(input.messages.some((m: any) => m.role === 'tool'), 'tool result fed back');
      }
      return { response: '{"title":"Tofu","description":"d","ingredients":[{"name":"tofu","amount":"200g"}],"steps":["x"],"tags":["vegan"]}' };
    },
  };
  const kv = mockKv();
  const r1 = await runRecipeAgent(aiWithCount, { query: 'tofu', diet: 'vegan', allergies: [] }, 'test1', kv);
  assert.equal(runCount, 1, 'first request runs agent');
  assert(r1?.recipe.title);
  const r2 = await runRecipeAgent(aiWithCount, { query: 'tofu', diet: 'vegan', allergies: [] }, 'test2', kv);
  assert.equal(runCount, 1, 'second request hits cache, no agent call');
  assert.deepEqual(r1?.recipe, r2?.recipe, 'cached result matches');

  globalThis.fetch = realFetch;
  console.log('ok');
}

main();
