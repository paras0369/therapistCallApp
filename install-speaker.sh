#!/bin/bash

echo "🔊 Installing Speaker Functionality..."
echo "======================================"

# Navigate to project directory
cd "$(dirname "$0")"

# Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# Check if Android build files exist
if [ -d "android" ]; then
    echo "🤖 Cleaning Android build..."
    cd android
    ./gradlew clean
    cd ..
fi

# Rebuild the app
echo "🔧 Rebuilding React Native app..."
npx react-native run-android

echo ""
echo "✅ Installation complete!"
echo ""
echo "📱 If you still have issues:"
echo "1. Close and restart Metro bundler"
echo "2. Clear cache: npx react-native start --reset-cache"
echo "3. Rebuild: npx react-native run-android"
echo ""
echo "🔊 Speaker button should now work properly!"