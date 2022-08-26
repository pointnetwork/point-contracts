import { task } from 'hardhat/config';
import fs = require('fs');

// npx hardhat identity-importer upload 0xD61e5eFcB183418E1f6e53D0605eed8167F90D4d --migration-file ./backup/ynet/identities/identity-1660314395.json  --network development
// npx hardhat identity-importer upload 0x001fc9C398BF1846a70938c920d0351722F34c83 --migration-file ../resources/migrations/identity-1647299819.json  --network ynet --handle-prefix ynet
// npx hardhat identity-importer download 0x1411f3dC11D60595097b53eCa3202c34dbee0CdA --network ynet
// npx hardhat identity-importer download 0x1411f3dC11D60595097b53eCa3202c34dbee0CdA --save-to ../resources  --network ynet
// npx hardhat identity-importer latestBlockMigrated 0x1574E97F7a60c4eE518f6d7c0Fa701eff8Ab58b3 --handle An77u --network ynet
// npx hardhat identity-importer download 0x1574E97F7a60c4eE518f6d7c0Fa701eff8Ab58b3 --from-block 8496819 --network ynet
// npx hardhat identity-importer latestIdentityMigrated 0x8E34Fc67034b8A593E87d5f2644D098A3dBd2Fe7 --network xnetPluto

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
  .addOptionalParam(
    'handle',
    'Handle to check the latest block migrated'
  )
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

    let migrationFolder = './resources/';

    if (taskArgs.saveTo != undefined) {
      migrationFolder = taskArgs.saveTo;
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

    if (taskArgs.action == 'download') {
      const fileStructure = {
        identities: [],
        ikv: [],
      } as any;

      const identitiesFilter = contract.filters.IdentityRegistered();
      const identityCreatedEvents = await contract.queryFilter(
        identitiesFilter, fromBlock, toBlock
      );
      const ikvSetFilter = contract.filters.IKVSet();
      const ikvSetEvents = await contract.queryFilter(ikvSetFilter, fromBlock, toBlock);

      if (identityCreatedEvents.length == 0) {
        console.log('No identities found.');
        return false;
      }

      console.log(`Found ${identityCreatedEvents.length} identities`);

      const identityData = [];
      for (const e of identityCreatedEvents) {
        if (e.args) {
          const { handle, identityOwner, commPublicKey } = e.args;

          console.log(`migrating handle ${handle} from ${identityOwner}`);

          const identity = {
            handle,
            owner: identityOwner,
            keyPart1: commPublicKey.part1,
            keyPart2: commPublicKey.part2,
            blockNumber: e.blockNumber
          };

          identityData.push(identity);
        }
      }

      fileStructure.identities = identityData;

      console.log(`Found ${ikvSetEvents.length} IKV parameters`);

      const ikvData = [];
      for (const e of ikvSetEvents) {
        if (e.args) {
          const { identity, key, value, version } = e.args;

          console.log(`migrating key ${key} with value of ${value}`);

          const ikv = {
            handle: identity,
            key,
            value,
            version,
            blockNumber: e.blockNumber
          };

          ikvData.push(ikv);
        }
      }

      fileStructure.ikv = ikvData;

      const timestamp = Math.round(Number(new Date()) / 1000);
      const filename = `identity-${timestamp}.json`;

      fs.writeFileSync(
        migrationFolder + filename,
        JSON.stringify(fileStructure, null, 4)
      );

      console.log('Downloaded');
    } else if (taskArgs.action == 'upload') {
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
        identityLastProcessedIndex: 0,
        ikvLastProcessedIndex: 0,
      } as any;

      const data = JSON.parse(
        fs.readFileSync(taskArgs.migrationFile).toString()
      );

      let processIdentityFrom = 0;
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
          console.log(
            `Last processed identity ${lockFile.identityLastProcessedIndex}`
          );
          console.log(`Last IVK param ${lockFile.ikvLastProcessedIndex}`);
          foundLockFile = true;
          processIdentityFrom = lockFile.identityLastProcessedIndex;
          processIkvFrom = lockFile.ikvLastProcessedIndex;
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
              `${lastIdentityAddedIndex} migrating ${prefix + identity.handle}`
            );
            await contract.register(
              prefix + identity.handle,
              identity.owner,
              identity.keyPart1,
              identity.keyPart2
            );
          } else {
            console.log(
              `Skipping migrated identity ${prefix + identity.handle}`
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

      try {
        console.log(`found ${data.ikv.length} IKV params`);
        for (const ikv of data.ikv) {
          lastIkvAddedIndex++;
          if (lastIkvAddedIndex > processIkvFrom || processIkvFrom == 0) {
            console.log(
              `${lastIkvAddedIndex} Migrating IVK param for ${
                prefix + ikv.handle
              } ${ikv.key} ${ikv.value}`
            );
            await contract.ikvImportKV(
              prefix + ikv.handle,
              ikv.key,
              ikv.value,
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
        await contract.setDevMode(false);
      }
    } else if (taskArgs.action == 'latestBlockMigrated') {

      const contract = await hre.ethers.getContractAt(
        'Identity',
        taskArgs.contract
      );

      const identitiesFilter = contract.filters.IdentityRegistered();
      const identityCreatedEvents = await contract.queryFilter(
        identitiesFilter
      );
      const ikvSetFilter = contract.filters.IKVSet();
      const ikvSetEvents = await contract.queryFilter(ikvSetFilter);

      if (identityCreatedEvents.length == 0) {
        console.log('No identities found.');
        return false;
      }

      console.log(`Found ${identityCreatedEvents.length} identities`);

      //get the block of latest identity migrated
      const blockNumbers = identityCreatedEvents.filter(e => e.args?.handle === taskArgs.handle).map(e => e.blockNumber);
      const maxBlockNumber = Math.max(...blockNumbers);
      console.log('Max block number migrated for IdentityRegistered: ' + maxBlockNumber);


      //consider that ikv can have registers after the latest identity migrated.
      const identityCreatedEventsMigrated = await contract.queryFilter(
        identitiesFilter, 0, maxBlockNumber
      );
      const handlesMigrated = identityCreatedEventsMigrated.map(e => e.args?.handle);
      const blockNumbersIkv = ikvSetEvents.filter(e => handlesMigrated.includes(e.args?.identity)).map(e => e.blockNumber)
      const maxBlockNumberIkv = Math.max(...blockNumbersIkv);
      console.log('Max block number migrated for ikvSetEvents: ' + maxBlockNumberIkv);

      console.log('Max block number migrated: ' + Math.max(maxBlockNumber, maxBlockNumberIkv))
    } else if (taskArgs.action == 'latestIdentityMigrated') {
      const contract = await hre.ethers.getContractAt(
        'Identity',
        taskArgs.contract
      );

      const identitiesFilter = contract.filters.IdentityRegistered();
      const identityCreatedEvents = await contract.queryFilter(
        identitiesFilter
      );

      if (identityCreatedEvents.length == 0) {
        console.log('No identities found.');
        return false;
      }
      console.log(`Found ${identityCreatedEvents.length} identities`);

      const blockNumbers = identityCreatedEvents.map(e => e.blockNumber);
      const maxBlockNumber = Math.max(...blockNumbers);
      const latestIdentites = identityCreatedEvents.filter(e => e.blockNumber == maxBlockNumber).map(e => e.args?.handle);
      console.log('Latest identities registered: ' + latestIdentites);
      console.log('Block: ' + maxBlockNumber);

    }
  });
