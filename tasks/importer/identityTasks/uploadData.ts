import { existsSync, promises as fs } from 'fs';
import { Identity } from '../../../typechain';

// TODO: don't we need specifying it by taskArg?
const LOCKFILE_PATH = './resources/migrations/identity-lock.json';
const TX_BUNDLE_SIZE = 100;

type IdentityBackupRecord = {
  handle: string;
  owner: string;
  keyPart1: string;
  keyPart2: string;
  blockNumber: number;
};

type IKV = {
  handle: string;
  key: string;
  value: string;
  version: string;
  blockNumber: number;
};

export const uploadData = async ({
  contract,
  contractAddress,
  prefix,
  migrationFilePath,
}: {
  contract: Identity;
  contractAddress: string;
  prefix: string;
  migrationFilePath: string;
}) => {
  console.log(`Starting data upload for contract ${contractAddress}`);

  const data = JSON.parse(await fs.readFile(migrationFilePath, 'utf8'));
  console.log(
    `Found ${data.identities.length} identities and ${data.ikv.length} ikv in the migration file`
  );

  let processIdentityFrom = 0;
  let processIkvFrom = 0;
  let failedIdentities: number[] = [];
  let failedIkv: number[] = [];

  if (existsSync(LOCKFILE_PATH)) {
    const lockFile = JSON.parse(await fs.readFile(LOCKFILE_PATH, 'utf8'));
    if (
      lockFile.migrationFilePath === migrationFilePath &&
      lockFile.contract === contractAddress
    ) {
      console.log('Previous lock file found');
      console.log(
        `Last processed identity ${lockFile.identityLastProcessedIndex}`
      );
      console.log(`Last IKV param ${lockFile.ikvLastProcessedIndex}`);
      console.log(`Failed identities: ${lockFile.failedIdentities.length}`);
      console.log(`Failed IKV: ${lockFile.failedIkv.length}`);
      processIdentityFrom = lockFile.identityLastProcessedIndex + 1;
      failedIdentities = lockFile.failedIdentities;
      processIkvFrom = lockFile.ikvLastProcessedIndex + 1;
      failedIkv = lockFile.failedIkv;
    } else {
      console.log('Lockfile not found');
    }
  } else {
    console.log('Lockfile not found');
  }

  try {
    await (await contract.setMigrationApplied(false)).wait();
    await (await contract.setDevMode(true)).wait();
  } catch (e) {
    console.error(
      'CRITICAL: setMigrationApplied or setDevMode txs failed! Contract is in half-migrated stage!'
    );
    console.error(e);
    return;
  }

  // Processing identities
  for (
    let i = processIdentityFrom;
    i < data.identities.length;
    i += TX_BUNDLE_SIZE
  ) {
    const addResults: boolean[] = await Promise.all(
      data.identities
        .slice(i, i + TX_BUNDLE_SIZE - 1)
        .map(async (identity: IdentityBackupRecord) => {
          try {
            await contract.register(
              prefix + identity.handle,
              identity.owner,
              identity.keyPart1,
              identity.keyPart2
            );
            return true;
          } catch (e) {
            console.error(`Error adding identity ${identity.handle}`, e);
            return false;
          }
        })
    );

    if (addResults.filter((res) => !!res).length === 0) {
      // All insertions failed, won't make any sense to continue
      console.error('All transaction in the batch failed, aborting');
      // try {
      //   await contract.setMigrationApplied(true);
      //   await contract.setDevMode(false);
      // } catch (e) {
      //   console.error(
      //     'CRITICAL: setMigrationApplied or setDevMode txs failed! Contract is in half-migrated stage!'
      //   );
      //   console.error(e);
      // }
      return;
    }
    if (addResults.filter((res) => !res).length === 0) {
      // No errors
      console.log('All transactions in the batch succeeded');
    } else {
      // Some transactions failed
      console.error(
        `${addResults.filter((res) => !res).length} transaction failed`
      );

      // Adding indexes of failed txs to the failedIdentities array
      failedIdentities.push(
        ...addResults.reduce(
          (acc: number[], cur, index) => [...acc, ...(cur ? [] : [index + i])],
          []
        )
      );
    }

    // Updating the lockfile
    await fs.writeFile(
      LOCKFILE_PATH,
      JSON.stringify({
        contract: contractAddress,
        migrationFilePath,
        identityLastProcessedIndex: Math.min(
          i + TX_BUNDLE_SIZE - 1,
          data.identities.length - 1
        ),
        failedIdentities,
        ikvLastProcessedIndex: processIkvFrom - 1, // We didn't start processing IKV
        failedIkv,
      })
    );
  }

  console.log(
    `Identities upload completed, failed identities: ${failedIdentities.length}`
  );
  // Trying to process failed identities
  const twiceFailedIdentities = [];
  for (let i = 0; i < failedIdentities.length; i += TX_BUNDLE_SIZE) {
    console.log(
      `Trying to add failed identities from ${i} to ${Math.min(
        i + TX_BUNDLE_SIZE - 1,
        failedIdentities.length - 1
      )}`
    );
    const addResults = await Promise.all(
      failedIdentities.slice(i, i + TX_BUNDLE_SIZE - 1).map(async (idx) => {
        try {
          await contract.register(
            prefix + data.identities[idx].handle,
            data.identities[idx].owner,
            data.identities[idx].keyPart1,
            data.identities[idx].keyPart2
          );
          return true;
        } catch (e) {
          console.error(
            `Error adding identity ${data.identities[idx].handle}`,
            e
          );
          return false;
        }
      })
    );

    twiceFailedIdentities.push(
      ...addResults.reduce(
        (acc: number[], cur, index) => [
          ...acc,
          ...(cur ? [] : [failedIdentities[index + i]]),
        ],
        []
      )
    );
  }

  if (twiceFailedIdentities.length === 0) {
    console.log('All previously failed identities successfully uploaded');
  } else {
    console.log(
      `${twiceFailedIdentities.length} identities failed to be uploaded from the second try`
    );
  }

  failedIdentities = twiceFailedIdentities;
  // Updating the lockfile
  await fs.writeFile(
    LOCKFILE_PATH,
    JSON.stringify({
      contract: contractAddress,
      migrationFilePath,
      identityLastProcessedIndex: data.identities.length - 1, // We have processed all
      failedIdentities,
      ikvLastProcessedIndex: processIkvFrom - 1, // We didn't start processing IKV
      failedIkv,
    })
  );

  // Processing IKV
  for (let i = processIkvFrom; i < data.ikv.length; i += TX_BUNDLE_SIZE) {
    const addResults: boolean[] = await Promise.all(
      data.ikv.slice(i, i + TX_BUNDLE_SIZE - 1).map(async (ikv: IKV) => {
        try {
          await contract.ikvImportKV(
            prefix + ikv.handle,
            ikv.key,
            ikv.value,
            ikv.version
          );
          return true;
        } catch (e) {
          console.error(`Error adding IKV ${ikv.handle}`, e);
          return false;
        }
      })
    );

    if (addResults.filter((res) => !!res).length === 0) {
      // All insertions failed, won't make any sense to continue
      console.error('All transaction in the batch failed, aborting');
      // try {
      //   await contract.setMigrationApplied(true);
      //   await contract.setDevMode(false);
      // } catch (e) {
      //   console.error(
      //     'CRITICAL: setMigrationApplied or setDevMode txs failed! Contract is in half-migrated stage!'
      //   );
      //   console.error(e);
      // }
      return;
    }
    if (addResults.filter((res) => !res).length === 0) {
      // No errors
      console.log('All transactions in the batch succeeded');
    } else {
      // Some transactions failed
      console.error(
        `${addResults.filter((res) => !res).length} transaction failed`
      );

      // Adding indexes of failed txs to the failedIdentities array
      failedIkv.push(
        ...addResults.reduce(
          (acc: number[], cur, index) => [...acc, ...(cur ? [] : [index + i])],
          []
        )
      );
    }

    // Updating the lockfile
    await fs.writeFile(
      LOCKFILE_PATH,
      JSON.stringify({
        contract: contractAddress,
        migrationFilePath,
        identityLastProcessedIndex: data.identities.length - 1, // We processed all identities
        failedIdentities,
        ikvLastProcessedIndex: Math.min(
          i + TX_BUNDLE_SIZE - 1,
          data.ikv.length - 1
        ),
        failedIkv,
      })
    );
  }

  console.log(`IKV upload completed, failed IKV: ${failedIkv.length}`);
  // Trying to process failed IKV
  const twiceFailedIkv = [];
  for (let i = 0; i < failedIkv.length; i += TX_BUNDLE_SIZE) {
    console.log(
      `Trying to add failed IKV from ${i} to ${Math.min(
        i + TX_BUNDLE_SIZE - 1,
        failedIkv.length - 1
      )}`
    );
    const addResults = await Promise.all(
      failedIkv.slice(i, i + TX_BUNDLE_SIZE - 1).map(async (idx) => {
        try {
          await contract.ikvImportKV(
            prefix + data.ikv[idx].handle,
            data.ikv[idx].key,
            data.ikv[idx].value,
            data.ikv[idx].version
          );
          return true;
        } catch (e) {
          console.error(`Error adding IKV ${data.ikv[idx].handle}`, e);
          return false;
        }
      })
    );

    twiceFailedIkv.push(
      ...addResults.reduce(
        (acc: number[], cur, index) => [
          ...acc,
          ...(cur ? [] : [failedIkv[index + i]]),
        ],
        []
      )
    );
  }

  if (twiceFailedIkv.length === 0) {
    console.log('All previously failed IKV successfully uploaded');
  } else {
    console.log(
      `${twiceFailedIkv.length} IKV failed to be uploaded from the second try`
    );
  }

  failedIkv = twiceFailedIkv;
  // Updating the lockfile
  await fs.writeFile(
    LOCKFILE_PATH,
    JSON.stringify({
      contract: contractAddress,
      migrationFilePath,
      identityLastProcessedIndex: data.identities.length - 1, // We have processed all
      failedIdentities,
      ikvLastProcessedIndex: data.ikv.length - 1, // We have processed all
      failedIkv,
    })
  );

  if (failedIdentities.length === 0 && failedIkv.length === 0) {
    if (existsSync(LOCKFILE_PATH)) {
      await fs.unlink(LOCKFILE_PATH);
    }
    console.log('Everything processed and uploaded, lock file removed.');
    try {
      await contract.finishMigrations();
      await contract.setDevMode(false);
    } catch (e) {
      console.error(
        'CRITICAL: setMigrationApplied or setDevMode txs failed! Contract is in half-migrated stage!'
      );
      console.error(e);
    }
  }
};
