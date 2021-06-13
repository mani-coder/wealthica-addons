#!/usr/bin/env bash

set -e
stars=$(printf '%*s' 30 '')

echo "Deleting build files ..."
rm -rf public/mani-coder

for DIR in 'pnl'
do
  echo "${stars// /*}"
  echo "Building $DIR Addon"
  echo "${stars// /*}"

  cd addon/$DIR
  npm install
  npm run build

done

cd ../../

for DIR in 'pnl'
do
  echo "${stars// /*}"
  echo "Building $DIR Widget"
  echo "${stars// /*}"

  cd widgets/$DIR
  npm install
  npm run build

done

cd ../../
