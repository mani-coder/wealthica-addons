#!/bin/sh

echo "Deleting build files ..."
rm -rf public/mani-coder

echo "Building Addon ..."
cd addon/pnl
npm run build

cd ../../

echo "Building Widget ..."
cd widgets/pnl
npm run build

cd ../../

echo "Deploying ..."
firebase deploy --only hosting:mani-coder
