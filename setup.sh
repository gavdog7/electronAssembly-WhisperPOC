#!/bin/bash

# Electron Assembly+Whisper POC Setup Script
# This script cleans and reinstalls all dependencies

set -e  # Exit on error

echo "🧹 Cleaning up existing installations..."

# Delete node_modules if it exists
if [ -d "node_modules" ]; then
    echo "  Removing node_modules..."
    rm -rf node_modules
fi

# Delete Python virtual environment if it exists
if [ -d "venv" ]; then
    echo "  Removing Python venv..."
    rm -rf venv
fi

# Delete package-lock.json to ensure clean install
if [ -f "package-lock.json" ]; then
    echo "  Removing package-lock.json..."
    rm -f package-lock.json
fi

echo "📦 Installing Node.js dependencies..."
npm install

echo "🐍 Setting up Python virtual environment..."
python3 -m venv venv

echo "🔧 Activating virtual environment and installing Python dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "🔨 Building native modules..."
npm run rebuild

echo "✅ Setup complete!"
echo ""
echo "To start the application:"
echo "  npm start"
echo ""
echo "To activate Python environment manually:"
echo "  source venv/bin/activate"