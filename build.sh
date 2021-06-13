#!/usr/bin/env bash

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
