import * as dotenv from 'dotenv';
import { HardhatUserConfig, task } from 'hardhat/config';
import { HttpNetworkUserConfig } from 'hardhat/types';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import '@nomiclabs/hardhat-ethers';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import '@openzeppelin/hardhat-upgrades';
import './tasks/importer/identity';
import './tasks/importer/blog';
import './tasks/importer/social-migrator';
import './tasks/importer/sms';
import './tasks/importer/identity-clone';
import './tasks/identity/identity-update-contract';
import './tasks/identity/identity-add-deployer';
import './tasks/identity/identity-remove-deployer';
import './tasks/identity/identity-list-deployers';

dotenv.config();

let productionPrivateKey = process.env.DEPLOYER_ACCOUNT;

try {
  if (productionPrivateKey === undefined) {
    const homedir = require('os').homedir();
    require('path').resolve(homedir, '.point', 'keystore', 'key.json');
    const wallet = require('ethereumjs-wallet')
      .hdkey.fromMasterSeed(
        require('bip39').mnemonicToSeedSync(
          require(require('path').resolve(
            homedir,
            '.point',
            'keystore',
            'key.json'
          )).phrase
        )
      )
      .getWallet();
    productionPrivateKey = wallet.getPrivateKey().toString('hex');
  }
} catch (e) {
  if (!productionPrivateKey) {
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

const developmentPrivateKey =
  process.env.DEPLOYER_ACCOUNT ||
  '0x011967d88c6b79116bb879d4c2bc2c3caa23569edd85dfe0bc596846837bbc8e';
const host = process.env.BLOCKCHAIN_HOST || 'blockchain_node';
const port = process.env.BLOCKCHAIN_PORT || 7545;
const buildPath = process.env.DEPLOYER_BUILD_PATH || './build';

const devaddress = `http://${host}:${port}`;

const ynetConfig: HttpNetworkUserConfig = {
  url: 'http://ynet.point.space:44444',
};
const xnetPlutoConfig: HttpNetworkUserConfig = {
  url: 'https://xnet-pluto-1.point.space/',
};

if (productionPrivateKey) {
  ynetConfig.accounts = [productionPrivateKey];
  xnetPlutoConfig.accounts = [productionPrivateKey];
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
      accounts: [developmentPrivateKey],
    },
    ynet: ynetConfig,
    xnetPluto: xnetPlutoConfig,
  },
};

export default config;
