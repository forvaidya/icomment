export const onRequest = async ({ request }) => {
  const email = request.headers.get('Cf-Access-Authenticated-User-Email') || 'Guest';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aspire</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 40px; }
    h1 { font-size: 32px; margin-bottom: 10px; }
    .welcome { color: #666; font-size: 16px; margin-bottom: 30px; }
    .user-email { color: #0066cc; font-weight: 600; }
    .nav { display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; }
    .nav a { padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 4px; transition: background 0.2s; }
    .nav a:hover { background: #0052a3; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🍲 Aspire</h1>
      <div class="welcome">
        Welcome, <span class="user-email">${email}</span>
      </div>
    </div>

    <div class="nav">
      <a href="/recipe-agent.html">📖 Recipe Agent</a>
      <a href="/add?a=2&b=3">➕ Add</a>
      <a href="/multiply?a=2&b=3">✖️ Multiply</a>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
};
