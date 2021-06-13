#!/bin/sh
set -e

echo "Deleting build files ..."
rm -rf public/mani-coder

echo "Building Addon ..."
cd addon/pnl
npm install
npm run build

cd ../../

echo "Building Widget ..."
cd widgets/pnl
npm install
npm run build

cd ../../

echo "Deploying ..."
firebase deploy --only hosting:mani-coder
