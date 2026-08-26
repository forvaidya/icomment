#!/bin/bash

set -e

echo "Setting up D1 database for psychomments..."

# Create D1 database (idempotent check)
echo "Creating D1 database..."
wrangler d1 create psychomments --yes || echo "Database may already exist, continuing..."

echo "✓ D1 database setup complete"
echo ""
echo "Next steps:"
echo "1. Run migrations: wrangler d1 migrations apply psychomments --remote"
echo "2. Test connection: wrangler d1 execute psychomments --remote 'SELECT 1'"
