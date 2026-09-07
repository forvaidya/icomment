```
Create a Cloudflare Worker called "recipe-agent-api" with:

## Project Structure
- wrangler.jsonc
- src/index.js (single file, no frameworks)

## wrangler.jsonc
- name: recipe-agent-api
- main: src/index.js
- compatibility_date: 2025-09-01
- AI binding with binding name "AI"

## src/index.js — Overview

A single Worker that:
- Handles OPTIONS /meal → returns CORS preflight headers
- Handles POST /meal → runs the recipe agent loop
- Returns JSON: { recipe: { title, description, ingredients[], steps[], tags[] } }

## CORS

The Worker will be called from a Cloudflare Pages site on a different
origin. Add permissive CORS headers to all responses:
- Access-Control-Allow-Origin: *
- Access-Control-Allow-Methods: GET, POST, OPTIONS
- Access-Control-Allow-Headers: Content-Type

## POST /meal — Request Body

Receives JSON: { query: string, diet: string, allergies: string[] }
- diet is one of: "veg", "non_veg", "vegan"
- allergies is an array of strings like: ["peanuts", "tree_nuts", "dairy"]

## System Prompt

Build the system prompt dynamically from the request:

"You are a recipe agent. You help users find or create recipes that
respect their dietary restrictions.

Dietary class: {diet}
- veg: no meat or fish, dairy and eggs are allowed
- non_veg: all ingredients allowed
- vegan: no animal products whatsoever (no meat, fish, dairy, eggs, honey)

Allergies to avoid: {allergies or "none"}

Rules:
1. Never include any ingredient that conflicts with the diet or allergies
2. If you are unsure whether an ingredient is safe, call the
   check_ingredient tool to verify it
3. If check_ingredient reveals a conflict, remove that ingredient and
   substitute a safe alternative
4. Always return the final recipe as structured JSON with fields:
   title, description, ingredients (array of {name, amount}),
   steps (array of strings), tags (array of strings like 'vegan',
   'nut-free', 'high-protein')
5. Keep recipes practical — ingredients should be commonly available
6. Yield 2-4 servings"

## Tool Definition

Define one tool:

{
  type: "function",
  function: {
    name: "check_ingredient",
    description: "Check if an ingredient is safe for a given diet and
                   allergy set. Returns allergen flags and diet compatibility.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Ingredient name to check" }
      },
      required: ["name"]
    }
  }
}

## Tool Implementation

When the LLM calls check_ingredient, execute this function:

async function check_ingredient(name) {
  // Query Open Food Facts search API (no key needed):
  // https://world.openfoodfacts.org/cgi/search.pl?search_terms={name}&json=1&page_size=1

  // From the first result, extract:
  // - allergens_tags (array of strings like "en:peanuts")
  // - ingredients_analysis_tags (array like "en:vegan", "en:vegetarian")

  // Return JSON:
  // {
  //   ingredient: name,
  //   allergens: ["peanuts", "tree_nuts", ...],
  //   is_vegan: true/false,
  //   is_vegetarian: true/false,
  //   safe_for_diet: true/false,   // computed against the user's diet
  //   safe_for_allergies: true/false  // computed against the user's allergies
  // }
}

The safe_for_diet and safe_for_allergies fields must be computed by
comparing the Open Food Facts tags against the user's diet and allergies
passed in the request body. Do not trust the LLM to enforce this —
compute it in code.

## Agent Loop

Implement the full agent loop:

1. Call env.AI.run("@cf/meta/llama-3.1-8b-instruct") with:
   - The system prompt (with diet + allergies context)
   - The user's query as the user message
   - The tools array
   - response_format: { type: "json_object" } for the final answer

2. If the LLM returns tool_calls:
   a. For each tool call, execute check_ingredient with the arguments
   b. Append the tool results to the conversation as tool messages
   c. Call env.AI.run() again with the full conversation
   d. Repeat until the LLM stops requesting tools

3. When the LLM returns a final answer (no tool_calls):
   - Parse the response as JSON
   - Validate it has title, ingredients, steps
   - Return it as the HTTP response

4. Cap the loop at 5 iterations to prevent infinite loops.
   If the cap is reached, return whatever the LLM has produced so far.

## Error Handling

- If the Open Food Facts API is unreachable, return a fallback:
  { ingredient: name, allergens: [], is_vegan: null,
    is_vegetarian: null, safe_for_diet: null,
    safe_for_allergies: null, warning: "Could not verify" }
  Let the LLM decide what to do with the warning.

- If the LLM output is not valid JSON, attempt to extract JSON from
  the text. If that fails, return a 500 with an error message.

## Rules

- Single file only (src/index.js)
- No external dependencies, no npm packages
- No D1, R2, KV, or AI Gateway yet
- Use fetch() for the Open Food Facts API call
- Keep the code readable and well-commented
```

This gives Claude Code everything it needs: the model, the tool, the loop, the fallback logic, and the CORS setup. Deploy it, point your Pages UI's `/meal` POST to the Worker URL, and you've got a working agent.