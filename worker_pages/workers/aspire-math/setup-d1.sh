#!/bin/bash
# D1 Database Setup Script
# Creates aspire-recipe-db and runs migrations

set -e

DB_NAME="aspire-recipe-db"
MIGRATION_FILE="./migrations/001_create_search_history.sql"

echo "📦 Creating D1 Database: $DB_NAME"
OUTPUT=$(npx wrangler d1 create "$DB_NAME" 2>&1)
echo "$OUTPUT"

# Extract database_id from output
DB_ID=$(echo "$OUTPUT" | grep "database_id" | sed -E 's/.*database_id = "([^"]+)".*/\1/')

if [ -z "$DB_ID" ]; then
  echo "❌ Failed to create database or extract ID"
  exit 1
fi

echo "✅ Database created with ID: $DB_ID"
echo ""
echo "📝 Update wrangler.toml with:"
echo "[[d1_databases]]"
echo "binding = \"DB\""
echo "database_name = \"$DB_NAME\""
echo "database_id = \"$DB_ID\""
echo ""

# Run migration on remote DB
echo "🚀 Running migration on remote database..."
npx wrangler d1 execute "$DB_NAME" --file "$MIGRATION_FILE" --remote

echo ""
echo "✅ D1 Setup Complete!"
echo "📋 Next: git add wrangler.toml && git commit && npx wrangler deploy"
