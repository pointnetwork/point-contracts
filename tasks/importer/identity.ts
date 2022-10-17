import { task } from 'hardhat/config';
import { promises as fs } from 'fs';
import { downloadData } from './identityTasks/downloadData';
import { uploadData } from './identityTasks/uploadData';

// UPLOAD EXAMPLES
// npx hardhat identity-importer upload 0xD61e5eFcB183418E1f6e53D0605eed8167F90D4d --migration-file ./backup/ynet/identities/identity-1660314395.json  --network development
// npx hardhat identity-importer upload 0x001fc9C398BF1846a70938c920d0351722F34c83 --migration-file ../resources/migrations/identity-1647299819.json  --network ynet --handle-prefix ynet
// npx hardhat identity-importer upload 0xD61e5eFcB183418E1f6e53D0605eed8167F90D4d --migration-file ./backup/ynet/identities/identity-1660314395.json  --network development
// npx hardhat identity-importer upload 0x47204DA8c773Aec5E2947055a081fC312A5C82cf --migration-file ./backup/xnetPluto/identities/identity-1617666-1700000.json   --network mainnet

// DOWNLOAD EXAMPLES
// npx hardhat identity-importer download 0x1411f3dC11D60595097b53eCa3202c34dbee0CdA --network ynet
// npx hardhat identity-importer download 0x1411f3dC11D60595097b53eCa3202c34dbee0CdA --save-to ../resources  --network ynet
// npx hardhat identity-importer download 0x1574E97F7a60c4eE518f6d7c0Fa701eff8Ab58b3 --from-block 8496819 --network ynet
// npx hardhat identity-importer latestBlockMigrated 0x1574E97F7a60c4eE518f6d7c0Fa701eff8Ab58b3 --handle An77u --network ynet
// npx hardhat identity-importer latestIdentityMigrated 0x8E34Fc67034b8A593E87d5f2644D098A3dBd2Fe7 --network xnetPluto
// npx hardhat identity-importer download 0x8E34Fc67034b8A593E87d5f2644D098A3dBd2Fe7 --from-block 1700001 --to-block 1800000 --network xnetPluto

task(
  'identity-importer',
  'Will download and upload data to point identity contract'
)
  .addPositionalParam('action', 'Use with "download" and "upload options"')
  .addPositionalParam('contract', 'Identity contract source address')
  .addOptionalParam('saveTo', 'Saves migration file to specific directory')
  .addOptionalParam('migrationFile', 'Migration file to when uploading data')
  .addOptionalParam(
    'handlePrefix',
    'Prefix to prepend to all handles when uploading'
  )
  .addOptionalParam('handle', 'Handle to check the latest block migrated')
  .addOptionalParam(
    'fromBlock',
    'The first block that should be considered to download data for migrations'
  )
  .addOptionalParam(
    'toBlock',
    'Latest block that should be considered to download data for migrations'
  )
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    if (!ethers.utils.isAddress(taskArgs.contract)) {
      console.log('Contract not valid.');
      return false;
    }

    const migrationFolder = taskArgs.saveTo ?? './resources/migrations/';

    const fromBlock = taskArgs.fromBlock ? Number(taskArgs.fromBlock) : 0;
    const toBlock = taskArgs.toBlock
      ? Number(taskArgs.toBlock)
      : (await hre.ethers.provider.getBlock('latest')).number;

    const contract = await hre.ethers.getContractAt(
      'Identity',
      taskArgs.contract
    );

    if (taskArgs.action === 'download') {
      const data = await downloadData({ contract, fromBlock, toBlock });

      const timestamp = Math.round(Number(new Date()) / 1000);
      const filename = `identity-${timestamp}.json`;

      await fs.writeFile(
        migrationFolder + filename,
        JSON.stringify(data, null, 4)
      );

      console.log('Data successfully written');
    } else if (taskArgs.action === 'upload') {
      if (taskArgs.migrationFile === undefined) {
        console.log(
          'Please inform the migration file with `--migration-file /path/to/file.json`'
        );
        return false;
      }

      const prefix = taskArgs.handlePrefix ?? '';

      await uploadData({
        contract,
        contractAddress: taskArgs.contract,
        prefix,
        migrationFilePath: taskArgs.migrationFile,
      });
    }
  });
