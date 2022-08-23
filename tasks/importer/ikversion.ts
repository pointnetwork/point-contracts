import { task } from 'hardhat/config';
import fs = require('fs');

// npx hardhat ikversion-importer 0x8E34Fc67034b8A593E87d5f2644D098A3dBd2Fe7 --migration-file ../resources/migrations/identity-1647299819.json --network xnetPluto

task(
  'ikversion-importer',
  'Will import only versions from a identity import file'
)
  .addPositionalParam('contract', 'Identity contract source address')
  .addOptionalParam('migrationFile', 'Migration file to when uploading data')
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    if (!ethers.utils.isAddress(taskArgs.contract)) {
      console.log('Contract not valid.');
      return false;
    }

    let migrationFolder = './resources/';

    if (taskArgs.saveTo != undefined) {
      migrationFolder = taskArgs.saveTo;
    }

    const contract = await hre.ethers.getContractAt(
      'Identity',
      taskArgs.contract
    );

      const lockFilePath = './resources/identity-lock.json';

      if (taskArgs.migrationFile === undefined) {
        console.log(
          'Please inform the migration file with `--migration-file /path/to/file.json`'
        );
        return false;
      }

      let prefix = '';
      if (taskArgs.handlePrefix !== undefined) {
        prefix = taskArgs.handlePrefix;
      }

      const lockFileStructure = {
        contract: taskArgs.contract.toString(),
        migrationFilePath: taskArgs.migrationFile.toString(),
        ikvLastProcessedIndex: 0,
      } as any;

      const data = JSON.parse(
        fs.readFileSync(taskArgs.migrationFile).toString()
      );

      let processIkvFrom = 0;
      let lastIdentityAddedIndex = 0;
      let lastIkvAddedIndex = 0;
      let foundLockFile = false;

      if (!fs.existsSync(lockFilePath)) {
        console.log('Lockfile not found');
      } else {
        const lockFile = JSON.parse(fs.readFileSync(lockFilePath).toString());
        if (
          lockFile.migrationFilePath == taskArgs.migrationFile.toString() &&
          lockFile.contract == taskArgs.contract.toString()
        ) {
          console.log('Previous lock file found');
          console.log(`Last IVK param ${lockFile.ikvLastProcessedIndex}`);
          foundLockFile = true;
          processIkvFrom = lockFile.ikvLastProcessedIndex;
        }
      }

      try {
        await (await contract.setMigrationApplied(false)).wait()
        await (await contract.setDevMode(true)).wait()
        console.log(`found ${data.ikv.length} IKV params`);
        for (const ikv of data.ikv) {
          lastIkvAddedIndex++;
          if (lastIkvAddedIndex > processIkvFrom || processIkvFrom == 0) {
            console.log(
              `${lastIkvAddedIndex} Migrating IVK param for ${
                prefix + ikv.handle
              } ${ikv.key} ${ikv.value}`
            );
            await contract.ikVersionImport(
              prefix + ikv.handle,
              ikv.key,
              ikv.version
            );
          } else {
            console.log(
              `Skipping migrated IVK param for ${prefix + ikv.handle} ${
                ikv.key
              } ${ikv.value}`
            );
          }
        }
      } catch (error) {
        lockFileStructure.ikvLastProcessedIndex = lastIkvAddedIndex;
        fs.writeFileSync(
          lockFilePath,
          JSON.stringify(lockFileStructure, null, 4)
        );
        console.log(
          `Error on ${lastIkvAddedIndex} of ${data.ikv.length} IVK params restart the process to pick-up from last processed item.`
        );
        await contract.setMigrationApplied(true);
        await contract.setDevMode(false);
        return false;
      }

      if (
        (lastIdentityAddedIndex == (data.identities.length)) &&
        (lastIkvAddedIndex == (data.ikv.length))
      ) {
            if (fs.existsSync(lockFilePath)) {
            fs.unlinkSync(lockFilePath);
            }
            console.log('Everything processed and uploaded, lock file removed.');
            await contract.finishMigrations();
        }
  });
