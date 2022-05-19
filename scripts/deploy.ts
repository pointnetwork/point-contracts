// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers, upgrades } from 'hardhat';
import fs from 'fs';
import path from 'path';
import {
  getProxyMetadataFileName,
  getProxyMetadataFilePath,
} from './utils/hardhatUtils';

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const identityAddressPath = path.join('resources', 'Identity-address.json');

  if (fs.existsSync(identityAddressPath)) {
    // eslint-disable-next-line import/no-dynamic-require, global-require, @typescript-eslint/no-var-requires
    const identityAddress = require(`../${identityAddressPath}`).address;
    const codeAt = await ethers.provider.getCode(identityAddress);
    if (codeAt !== '0x') {
      console.log('Identity already deployed to:', identityAddress);
      console.log(
        'If you want a new identity deploy clean your blockchain data or delete hardhat/resources/Identity-address.json file'
      );
      return;
    }
  }

  // attach
  const proxyMetadataFileName = await getProxyMetadataFileName(ethers.provider);
  const proxyMetadataFilePath = await getProxyMetadataFilePath(ethers.provider);

  // We get the contract to deploy
  const Identity = await ethers.getContractFactory('Identity');
  const identity = await upgrades.deployProxy(Identity, [], { kind: 'uups' });
  await identity.deployed();

  if (process.env.MODE === 'e2e' || process.env.MODE === 'zappdev') {
    console.log('Setting dev mode to true');
    await identity.setDevMode(true);
  }

  console.log('Identity deployed to:', identity.address);

  fs.writeFileSync(
    identityAddressPath,
    JSON.stringify({ address: identity.address })
  );
  fs.copyFileSync(
    proxyMetadataFilePath,
    path.join('resources', proxyMetadataFileName)
  );
  console.log('Identity abi was copied to build folder');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
