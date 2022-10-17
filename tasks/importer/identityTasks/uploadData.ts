import { existsSync, promises as fs } from 'fs';
import { Identity } from '../../../typechain';

// TODO: don't we need specifying it by taskArg?
const LOCKFILE_PATH = './resources/migrations/identity-lock.json';
const TX_BUNDLE_SIZE = 30;
const TX_BUNDLE_SIZE_IKV = 15;

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

  const data: {
    identities: IdentityBackupRecord[];
    ikv: IKV[];
  } = JSON.parse(await fs.readFile(migrationFilePath, 'utf8'));
  console.log(
    `Found ${data.identities.length} identities and ${data.ikv.length} ikv in the migration file`
  );

  let processIdentityFrom = 0;
  let processIkvFrom = 0;

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
      console.log(`Last processed IKV ${lockFile.ikvLastProcessedIndex}`);
      processIdentityFrom = lockFile.identityLastProcessedIndex + 1;
      processIkvFrom = lockFile.ikvLastProcessedIndex + 1;
    } else {
      console.log('Lockfile not found');
    }
  } else {
    console.log('Lockfile not found');
  }

  try {
    await (await contract.setMigrationApplied(false)).wait();
    await (await contract.setDevMode(true)).wait();
    console.log('MigrationApplied set to true, dev mode set to false');
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
    console.log(
      `Uploading identities batch from ${i} to ${i + TX_BUNDLE_SIZE - 1}`
    );
    const identitiesToRegister = data.identities.slice(i, i + TX_BUNDLE_SIZE);
    await contract.registerMultiple(
      identitiesToRegister.map((id) => prefix + id.handle),
      identitiesToRegister.map((id) => (prefix + id.handle).toLowerCase()),
      identitiesToRegister.map((id) => id.owner),
      identitiesToRegister.map((id) => id.keyPart1),
      identitiesToRegister.map((id) => id.keyPart2)
    );

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
        ikvLastProcessedIndex: processIkvFrom - 1, // We didn't start processing IKV
      })
    );
  }
  console.log('All identities uploaded');

  // Processing IKV
  for (let i = processIkvFrom; i < data.ikv.length; i += TX_BUNDLE_SIZE_IKV) {
    console.log(`Uploading IKV batch from ${i} to ${i + TX_BUNDLE_SIZE_IKV - 1}`);
    const ikvToRegister = data.ikv.slice(i, i + TX_BUNDLE_SIZE_IKV);
    await contract.ikvImportMultipleKV(
      ikvToRegister.map((ikv) => prefix + ikv.handle),
      ikvToRegister.map((ikv) => ikv.key),
      ikvToRegister.map((ikv) => ikv.value),
      ikvToRegister.map((ikv) => ikv.version)
    );

    // Updating the lockfile
    await fs.writeFile(
      LOCKFILE_PATH,
      JSON.stringify({
        contract: contractAddress,
        migrationFilePath,
        identityLastProcessedIndex: data.identities.length - 1, // We processed all identities
        ikvLastProcessedIndex: Math.min(
          i + TX_BUNDLE_SIZE_IKV - 1,
          data.ikv.length - 1
        ),
      })
    );
  }

  console.log('IKV upload completed');

  if (existsSync(LOCKFILE_PATH)) {
    await fs.unlink(LOCKFILE_PATH);
  }
  console.log('Everything processed and uploaded, lock file removed.');
  try {
    await contract.setMigrationApplied(true);
    await contract.setDevMode(false);
  } catch (e) {
    console.error(
      'CRITICAL: setMigrationApplied or setDevMode txs failed! Contract is in half-migrated stage!'
    );
    console.error(e);
  }
};
