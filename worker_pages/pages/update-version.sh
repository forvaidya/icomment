#!/bin/bash
# Update git SHA in all HTML pages before deploy

GIT_SHA=$(git rev-parse --short HEAD)
echo "Updating pages with git SHA: $GIT_SHA"

# Update index.html
sed -i '' "s/<meta name=\"version\" content=\"[^\"]*\">/<meta name=\"version\" content=\"$GIT_SHA\">/" index.html

# Update recipe-agent.html
sed -i '' "s/<meta name=\"version\" content=\"[^\"]*\">/<meta name=\"version\" content=\"$GIT_SHA\">/" recipe-agent.html

echo "✓ Version updated to $GIT_SHA"
