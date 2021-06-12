#!/bin/sh

echo "Building Addon ..."
cd addon/pnl
npm run test

cd ../../

echo "Building Widget ..."
cd widgets/pnl
npm run build

cd ../../

echo "Deploying ..."
firebase deploy
