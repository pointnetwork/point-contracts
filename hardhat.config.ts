import * as dotenv from 'dotenv';
import { HardhatUserConfig, task } from 'hardhat/config';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import '@nomiclabs/hardhat-ethers';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import '@openzeppelin/hardhat-upgrades';
import './tasks/importer/identity';
import './tasks/importer/blog';
import './tasks/importer/pointSocial';
import './tasks/importer/social-migrator.ts';
import './tasks/importer/sms';
import './tasks/importer/identity-clone';
import './tasks/identity/identity-update-contract';
import './tasks/identity/identity-add-deployer';
import './tasks/identity/identity-remove-deployer';
import './tasks/identity/identity-list-deployers';
import './tasks/social/posts-scores.ts';

dotenv.config();

let ynetPrivateKey = process.env.DEPLOYER_ACCOUNT;

try {
  if (ynetPrivateKey === undefined) {
    const homedir = require('os').homedir();
    require('path').resolve(homedir, '.point', 'keystore', 'key.json');
    const wallet = require('ethereumjs-wallet').hdkey.fromMasterSeed(
        require('bip39').mnemonicToSeedSync(require(
            require('path').resolve(homedir, '.point', 'keystore', 'key.json')).phrase
        )
      ).getWallet();
      ynetPrivateKey = wallet.getPrivateKey().toString('hex');
  }
} catch (e) {
  if (!ynetPrivateKey) {
    console.log(
      'Warn: YNet account not found. Will not be possible to deploy to YNet.'
    );
  }
}

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const privateKey =
  process.env.DEPLOYER_ACCOUNT ||
  '0x011967d88c6b79116bb879d4c2bc2c3caa23569edd85dfe0bc596846837bbc8e';
const host = process.env.BLOCKCHAIN_HOST || 'blockchain_node';
const port = process.env.BLOCKCHAIN_PORT || 7545;
const buildPath = process.env.DEPLOYER_BUILD_PATH || './build';

const devaddress = `http://${host}:${port}`;
console.log(devaddress);

const ynetConfig: any = {
  url: 'http://ynet.point.space:44444',
};

if (ynetPrivateKey) {
  ynetConfig.accounts = [ynetPrivateKey];
}

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.0',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
      {
        version: '0.8.4',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
      {
        version: '0.8.7',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
    ],
  },
  paths: {
    artifacts: buildPath,
  },
  networks: {
    development: {
      url: devaddress,
      accounts: [privateKey],
    },
    ynet: ynetConfig,
  },
};

export default config;
