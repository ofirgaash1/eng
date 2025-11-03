#!/bin/bash

# Exit immediately if a command fails
set -e

# Pull the latest changes
git pull

# Build the project
npm run build

# Add all changes
git add .

# Commit with a message
git commit -m "hi"

# Push to the main branch
git push

# Push the contents of the dist folder to gh-pages branch
git subtree push --prefix dist origin gh-pages

