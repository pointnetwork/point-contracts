import { task } from 'hardhat/config';
import fs = require('fs');

// npx hardhat dapps-importer 0x001fc9C398BF1846a70938c920d0351722F34c83 --migration-file ./resources/identity-1647299819.json  --network ynet 
task(
  'dapps-importer',
  'Will upload data to point identity contract regarding dapps list'
)
  .addPositionalParam('contract', 'Identity contract source address')
  .addOptionalParam('migrationFile', 'Migration file to when uploading data')
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    if (!ethers.utils.isAddress(taskArgs.contract)) {
      console.log('Contract not valid.');
      return false;
    }

    const contract = await hre.ethers.getContractAt(
      'Identity',
      taskArgs.contract
    );


    const lockFilePath = './resources/identity-dapps-lock.json';

    if (taskArgs.migrationFile === undefined) {
      console.log(
        'Please inform the migration file with `--migration-file /path/to/file.json`'
      );
      return false;
    }

    const lockFileStructure = {
      contract: taskArgs.contract.toString(),
      migrationFilePath: taskArgs.migrationFile.toString(),
      identityLastProcessedIndex: 0
    } as any;

    const data = JSON.parse(
      fs.readFileSync(taskArgs.migrationFile).toString()
    );

    let processIdentityFrom = 0;
    let lastIdentityAddedIndex = 0;
    let foundLockFile = false;
    let dappsFound = 0;

    if (!fs.existsSync(lockFilePath)) {
      console.log('Lockfile not found');
    } else {
      const lockFile = JSON.parse(fs.readFileSync(lockFilePath).toString());
      if (
        lockFile.migrationFilePath == taskArgs.migrationFile.toString() &&
        lockFile.contract == taskArgs.contract.toString()
      ) {
        console.log('Previous lock file found');
        console.log(
          `Last processed identity ${lockFile.identityLastProcessedIndex}`
        );
        foundLockFile = true;
        processIdentityFrom = lockFile.identityLastProcessedIndex;
      }
    }

    try {
      console.log(`found ${data.identities.length}`);
      await (await contract.setMigrationApplied(false)).wait()
      await (await contract.setDevMode(true)).wait()
      for (const identity of data.identities) {
        if (
          lastIdentityAddedIndex > processIdentityFrom ||
          processIdentityFrom == 0
        ) {
          console.log(
            `${lastIdentityAddedIndex} trying migrating ${identity.handle}`
          );

          const isDapp = await contract.isDapp(
            identity.handle
          );
          console.log(isDapp);
          if(isDapp){
            await contract.dappsListImport(identity.handle);
            dappsFound++;
          }

          console.log(
            `${lastIdentityAddedIndex} imported as dapp ${isDapp}`
          );

        } else {
          console.log(
            `Skipping migrated identity ${identity.handle}`
          );
        }
        lastIdentityAddedIndex++;
      }
    } catch (error) {
      lockFileStructure.identityLastProcessedIndex = lastIdentityAddedIndex;
      fs.writeFileSync(
        lockFilePath,
        JSON.stringify(lockFileStructure, null, 4)
      );
      console.log(
        `Error on ${lastIdentityAddedIndex} of ${data.identities.length} identities restart the process to pick-up from last processed item.`
      );
      console.log(error);
      await contract.setMigrationApplied(true);
      await contract.setDevMode(false);
      return false;
    }

    lockFileStructure.identityLastProcessedIndex = lastIdentityAddedIndex;

    

    if (lastIdentityAddedIndex == data.identities.length) {
      if (fs.existsSync(lockFilePath)) {
        fs.unlinkSync(lockFilePath);
      }
      console.log('Everything processed and uploaded, lock file removed.');
      console.log(`${dappsFound} imported`);
      
      await contract.finishMigrations();
      await contract.setDevMode(false);
    }
    
  });
