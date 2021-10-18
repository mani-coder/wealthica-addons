#!/usr/bin/env bash

set -e
stars=$(printf '%*s' 30 '')

unset npm_config_prefix

export NVM_DIR=$HOME/.nvm;
if [ -f "$NVM_DIR/nvm.sh" ]; then
  source $NVM_DIR/nvm.sh;
  nvm use
fi

echo "Deleting build files ..."
rm -rf public/mani-coder

for DIR in 'pnl' 'events'
do
  echo "${stars// /*}"
  echo "Building $DIR Addon"
  echo "${stars// /*}"

  cd addon/$DIR
  npm install
  npm run build
  cd ../../

done


for DIR in 'pnl' 'earnings' 'dividends'
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
