export const onRequest = async ({ request }) => {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email') || 'Guest';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🍲 Recipe Agent</title>
    <script src="https://unpkg.com/htmx.org@1.9.10"><\/script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f5f5f5;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
        }

        header {
            background: white;
            padding: 20px;
            text-align: center;
            border-bottom: 1px solid #ddd;
            flex-shrink: 0;
        }

        header .logo {
            font-size: 3rem;
            margin-bottom: 10px;
        }

        header h1 {
            font-size: 24px;
            margin: 0 0 10px 0;
            color: #333;
        }

        header .user-info {
            font-size: 14px;
            color: #666;
        }

        #aspire-user-email-display {
            color: #0066cc;
            font-weight: 600;
        }

        #app {
            flex: 1;
            padding: 20px;
        }

        footer {
            border-top: 1px solid #ddd;
            padding: 20px;
            background: white;
            text-align: center;
            font-size: 12px;
            color: #999;
            margin-top: auto;
            flex-shrink: 0;
        }

        footer p {
            margin: 4px 0;
        }

        nav {
            margin-bottom: 30px;
        }

        .recipe-container {
            max-width: 600px;
            margin: 0 auto;
        }

        .recipe-card {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .recipe-title {
            font-size: 28px;
            margin-bottom: 20px;
            color: #333;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-label {
            display: block;
            font-weight: 600;
            margin-bottom: 10px;
            color: #333;
            font-size: 14px;
        }

        .form-textarea {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: inherit;
            font-size: 14px;
            resize: vertical;
        }

        .checkbox-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
        }

        .checkbox-option {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .checkbox-option input[type="checkbox"],
        .checkbox-option input[type="radio"] {
            cursor: pointer;
            width: 18px;
            height: 18px;
        }

        .checkbox-option label {
            cursor: pointer;
            user-select: none;
            font-size: 14px;
        }

        .submit-button {
            width: 100%;
            padding: 14px 20px;
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 20px;
            transition: background 0.2s;
        }

        .submit-button:hover:not(:disabled) {
            background: #0052a3;
        }

        .submit-button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .result-box {
            margin-top: 20px;
            padding: 15px;
            background: #f9f9f9;
            border-radius: 4px;
            border: 1px solid #ddd;
            min-height: 40px;
        }

        .result-loading {
            color: #666;
            font-style: italic;
        }

        .result-error {
            color: #d32f2f;
        }

        .toast {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #fff3cd;
            border: 1px solid #ffc107;
            color: #856404;
            padding: 16px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            max-width: 400px;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        }

        .toast.error {
            background: #f8d7da;
            border-color: #f5c6cb;
            color: #721c24;
        }

        .toast.success {
            background: #d4edda;
            border-color: #c3e6cb;
            color: #155724;
        }

        .toast.info {
            background: #d1ecf1;
            border-color: #bee5eb;
            color: #0c5460;
        }

        @keyframes slideIn {
            from {
                transform: translateX(450px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(450px);
                opacity: 0;
            }
        }
    </style>
</head>
<body>
    <header>
        <div class="logo">🐵</div>
        <h1>Recipe Agent</h1>
        <div class="user-info">
            Logged in as <span id="aspire-user-email-display">${email}</span>
        </div>
    </header>

    <div id="app">
        <nav style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
            <a class="nav-link" href="/">← Back to Home</a>
            <div style="display: flex; gap: 10px; align-items: center;">
                <label for="logLevel" style="font-size: 12px; color: #666;">Debug Level:</label>
                <select id="logLevel" style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; background: white; cursor: pointer;">
                    <option value="error">Error</option>
                    <option value="info">Info</option>
                    <option value="debug" selected>Debug</option>
                </select>
            </div>
        </nav>

        <div class="recipe-container">
            <div id="welcomeSection" style="margin-bottom: 20px; padding: 15px; background: #e3f2fd; border-radius: 6px; border-left: 4px solid #2196F3;">
                <p style="margin: 0; font-size: 14px; color: #1565c0;">
                    Welcome, <strong id="userEmail">${email}</strong>
                    <span id="searchCount" style="margin-left: 15px; color: #666; font-size: 12px;"></span>
                </p>
            </div>

            <div class="recipe-container">
                <div class="recipe-card">
                    <h2 class="recipe-title">🍲 Recipe Agent</h2>

                    <div id="recentSearchesContainer" style="margin-bottom: 20px; display: none;">
                        <label class="form-label">Your Recent Searches</label>
                        <div id="recentSearchesList" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="query">What would you like to cook?</label>
                        <textarea class="form-textarea" id="query" rows="3" placeholder="What would you like to cook?">Pasta in white sauce</textarea>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Diet (select one)</label>
                        <div class="checkbox-grid">
                            <div class="checkbox-option">
                                <input type="radio" id="veg" name="diet" value="veg" checked>
                                <label for="veg">Veg</label>
                            </div>
                            <div class="checkbox-option">
                                <input type="radio" id="non_veg" name="diet" value="non_veg">
                                <label for="non_veg">Non-Veg</label>
                            </div>
                            <div class="checkbox-option">
                                <input type="radio" id="vegan" name="diet" value="vegan">
                                <label for="vegan">Vegan</label>
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Allergies (broad categories)</label>
                        <div class="checkbox-grid">
                            <div class="checkbox-option">
                                <input type="checkbox" id="nuts" name="allergies" value="nuts">
                                <label for="nuts">Nuts</label>
                            </div>
                            <div class="checkbox-option">
                                <input type="checkbox" id="dairy" name="allergies" value="dairy">
                                <label for="dairy">Dairy</label>
                            </div>
                            <div class="checkbox-option">
                                <input type="checkbox" id="seafood" name="allergies" value="seafood">
                                <label for="seafood">Seafood</label>
                            </div>
                            <div class="checkbox-option">
                                <input type="checkbox" id="eggs" name="allergies" value="eggs">
                                <label for="eggs">Eggs</label>
                            </div>
                            <div class="checkbox-option">
                                <input type="checkbox" id="gluten" name="allergies" value="gluten">
                                <label for="gluten">Gluten</label>
                            </div>
                            <div class="checkbox-option">
                                <input type="checkbox" id="soy" name="allergies" value="soy">
                                <label for="soy">Soy</label>
                            </div>
                            <div class="checkbox-option">
                                <input type="checkbox" id="seeds" name="allergies" value="seeds">
                                <label for="seeds">Seeds</label>
                            </div>
                        </div>
                    </div>

                    <button class="submit-button" id="generateBtn">Generate Recipe</button>
                    <div class="result-box" id="result"></div>
                </div>
            </div>
        </div>
    </div>

    <footer>
        <p>Recipe Agent v1.0 — Powered by AI</p>
    </footer>

    <script src="/recipe-agent.js"><\/script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
};
