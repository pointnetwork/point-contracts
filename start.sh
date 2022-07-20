#!/bin/sh

NETWORK=${NETWORK:-development}

echo $NETWORK

npx hardhat run scripts/deploy.ts --network $NETWORK