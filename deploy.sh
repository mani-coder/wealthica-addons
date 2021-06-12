#!/bin/sh

echo "Building Addon"
cd addon/pnl
npm run build

echo "Building Widget"
cd widgets/pnl
npm run build

firebase deploy
