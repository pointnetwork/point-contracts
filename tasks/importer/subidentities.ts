import { task } from 'hardhat/config';
import fs = require('fs');

// npx hardhat subidentities-importer upload 0x001fc9C398BF1846a70938c920d0351722F34c83 --migration-file ./resources/identity-1647299819.json  --network ynet 
// npx hardhat subidentities-importer download 0x001fc9C398BF1846a70938c920d0351722F34c83 --migration-file ./resources/identity-1647299819.json  --network ynet 
task(
  'subidentities-importer',
  'Will upload data to point identity contract regarding subidentites list'
)
  .addPositionalParam('action', 'Use with "download" and "upload options"')
  .addPositionalParam('contract', 'Identity contract source address')
  .addOptionalParam('migrationFile', 'Migration file to when uploading data')
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

    let fromBlock = 0;
    if (taskArgs.fromBlock !== undefined) {
      fromBlock = parseInt(taskArgs.fromBlock);
    }
    console.log("from: " + fromBlock);

    let toBlock = (await hre.ethers.provider.getBlock("latest")).number;
    if (taskArgs.toBlock !== undefined) {
      toBlock = parseInt(taskArgs.toBlock);
    }
    console.log("to: " + toBlock);

    const contract = await hre.ethers.getContractAt(
      'Identity',
      taskArgs.contract
    );

    let migrationFolder = './resources/';
    const lockFilePath = './resources/identity-subidentities-lock.json';

    if (taskArgs.migrationFile === undefined) {
      console.log(
        'Please inform the migration file with `--migration-file /path/to/file.json`'
      );
      return false;
    }

    if (taskArgs.action == 'upload') {

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
      let subidentitiesFound = 0;

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
      
                await contract.subidentitiesListImport(
                  identity.owner, identity.subhandle + '.' + identity.handle
                );
                subidentitiesFound++;
                console.log(subidentitiesFound);
                
                console.log(
                  `${lastIdentityAddedIndex} imported as subidentity ${identity.subhandle}.${identity.handle}`
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
        console.log(`${subidentitiesFound} imported`);
        
        await contract.finishMigrations();
        await contract.setDevMode(false);
      }
    } else {
      //download
      const fileStructure = {
        identities: [],
      } as any;
      //SubidentityRegistered(handle, subhandle, identityOwner, commPublicKey)
      const identitiesFilter = contract.filters.SubidentityRegistered();
      const identityCreatedEvents = await contract.queryFilter(
        identitiesFilter, fromBlock, toBlock
      );
      
      if (identityCreatedEvents.length == 0) {
        console.log('No identities found.');
        return false;
      }

      console.log(`Found ${identityCreatedEvents.length} identities`);

      const identityData = [];
      for (const e of identityCreatedEvents) {
        if (e.args) {
          const { handle, subhandle, identityOwner, commPublicKey } = e.args;

          console.log(`migrating handle ${subhandle}.${handle} from ${identityOwner}`);

          const identity = {
            handle,
            subhandle,
            owner: identityOwner,
            keyPart1: commPublicKey.part1,
            keyPart2: commPublicKey.part2,
            blockNumber: e.blockNumber
          };

          identityData.push(identity);
        }
      }

      fileStructure.identities = identityData;

      const timestamp = Math.round(Number(new Date()) / 1000);
      const filename = `identity-${timestamp}.json`;

      fs.writeFileSync(
        migrationFolder + filename,
        JSON.stringify(fileStructure, null, 4)
      );

      console.log('Downloaded');
    }
    
  });
