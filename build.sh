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
  cd ../../

done


for DIR in 'pnl' 'earnings'
do
  echo "${stars// /*}"
  echo "Building $DIR Widget"
  echo "${stars// /*}"

  cd widgets/$DIR
  npm install
  npm run build
  cd ../../

done

cd ../../
