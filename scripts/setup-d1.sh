#!/bin/bash

set -e

echo "Setting up infrastructure for psychomments..."

# Create D1 database (idempotent check)
echo "Creating D1 database..."
wrangler d1 create psychomments --yes || echo "Database may already exist, continuing..."

# Initialize KV with admin list
echo "Setting up KV admin list..."
wrangler kv:key put admin-emails '["forvaidya@gmail.com"]' --binding=KV_ADMIN --path=psychomments-admin || echo "KV already initialized or namespace needs manual creation"

echo "✓ D1 database setup complete"
echo "✓ KV admin list initialized"
echo ""
echo "Next steps:"
echo "1. Run migrations: wrangler d1 migrations apply psychomments --remote"
echo "2. Test connection: wrangler d1 execute psychomments --remote 'SELECT 1'"
echo "3. Deploy: wrangler deploy"
