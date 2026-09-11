#!/bin/bash
set -e

# Get the current git SHA (8 chars)
SHA1=$(git rev-parse HEAD | cut -c1-8)
echo "Building Pages with SHA1: $SHA1"

# Generate HTML from templates with SHA1 substitution
sed -e "s/{{SHA1}}/$SHA1/g" index.html.template > index.html
sed -e "s/{{SHA1}}/$SHA1/g" recipe-agent.html.template > recipe-agent.html

echo "✓ Generated index.html"
echo "✓ Generated recipe-agent.html"
