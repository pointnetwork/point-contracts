import { task } from 'hardhat/config';
import fs = require('fs');
import { getProxyMetadataFilePath } from '../../scripts/utils/hardhatUtils';

// npx hardhat compile
// npx hardhat identity-update-contract 0xD61e5eFcB183418E1f6e53D0605eed8167F90D4d ./resources/unknown-1337.json --network development

task(
  'identity-update-contract',
  'Will update point identity contract and metadata file'
)
  .addPositionalParam('address', 'Identity contract source address')
  .addPositionalParam(
    'metadataFile',
    'Metadata file with information about the proxy'
  )
  .setAction(async (taskArgs, hre) => {
    const { ethers, upgrades, config } = hre;

    if (!ethers.utils.isAddress(taskArgs.address)) {
      console.log('Address of contract not valid.');
      return false;
    }

    if (!fs.existsSync(taskArgs.metadataFile)) {
      console.log('Metada file does not exists.');
      return false;
    }

    if (!fs.existsSync('.openzeppelin')) {
      fs.mkdirSync('.openzeppelin');
    }
    const proxyMetadataFilePath = await getProxyMetadataFilePath(
      ethers.provider
    );
    fs.copyFileSync(taskArgs.metadataFile, proxyMetadataFilePath);

    const FEE_DATA = {
      maxFeePerGas: ethers.utils.parseUnits('100', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('5', 'gwei'),
      gasPrice: ethers.utils.parseUnits('1', 'gwei'),
    };

    // Wrap the provider so we can override fee data.
    const provider = new ethers.providers.FallbackProvider(
      [ethers.provider],
      1
    );
    provider.getFeeData = async () => FEE_DATA;

    const signer = new ethers.Wallet(
      (config.networks.ynet.accounts as string)[0],
      provider
    );

    const contractF = await ethers.getContractFactory('Identity', signer);
    const proxy = await upgrades.upgradeProxy(taskArgs.address, contractF);
    await proxy.deployed();

    fs.copyFileSync(proxyMetadataFilePath, taskArgs.metadataFile);
    console.log('Identity contract and metadata file updated.');
  });
