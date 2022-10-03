import path from 'path';
import { task } from 'hardhat/config';
import fs from 'fs';

const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000';
const BYTES32_ZERO =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

const FILE_PATH = path.resolve('./resources/identities.json'); // TODO
const REPORT_PATH = path.resolve('./resources/identities-report.json'); // TODO

task('check-identities')
  .addPositionalParam('contract', 'Identity contract source address')
  .setAction(async (args, hre) => {
    const contract = await hre.ethers.getContractAt('Identity', args.contract);
    const data = JSON.parse(await fs.promises.readFile(FILE_PATH, 'utf8'));

    const identityList = data.identities;
    const dappsList = data.dapps;

    let identitiesStartIndex = 0;
    let dappsStartIndex = 0;
    let identityErrors = [];
    let dappsErrors = [];
    if (fs.existsSync(REPORT_PATH)) {
      console.log('Found saved report');
      const report = JSON.parse(
        await fs.promises.readFile(REPORT_PATH, 'utf8')
      );
      identitiesStartIndex = report.identitiesLastProcessedIndex
        ? report.identitiesLastProcessedIndex + 1
        : 0;
      dappsStartIndex = report.dappsLastProcessedIndex
        ? report.dappsLastProcessedIndex + 1
        : 0;
      identityErrors = report.identityErrors ?? [];
      dappsErrors = report.dappsErrors ?? [];
    }

    for (let i = identitiesStartIndex; i < identityList.length; i++) {
      const errors = [];
      try {
        console.log(`Checking identity ${identityList[i]}...`);

        const owner = await contract.identityToOwner(identityList[i]);
        if (owner === ADDRESS_ZERO) {
          console.log('ERROR: identityToOwner is missing');
          errors.push('identityToOwner_missing');
        } else {
          const identity = await contract.ownerToIdentity(owner);
          if (identity === ADDRESS_ZERO) {
            console.log('ERROR: ownerToIdentity is missing');
            errors.push('ownerToIdentity_missing');
          } else if (identity !== identityList[i]) {
            console.log('ERROR: ownerToIdentity mismatch');
            errors.push('ownerToIdentity_mismatch');
          }
        }

        const commPublicKey = await contract.identityToCommPublicKey(
          identityList[0]
        );
        if (
          commPublicKey.part1 === BYTES32_ZERO ||
          commPublicKey.part2 === BYTES32_ZERO
        ) {
          console.log('ERROR: commPublicKey missing');
          errors.push('identityToCommPublicKey_missing');
        }

        const canonical = await contract.lowercaseToCanonicalIdentities(
          identityList[i].toLowerCase()
        );
        if (!canonical) {
          console.log('ERROR: lowercaseToCanonicalIdentities missing');
          errors.push('lowercaseToCanonicalIdentities_missing');
        } else if (canonical !== identityList[i]) {
          console.log('ERROR: lowercaseToCanonicalIdentities mismatch');
          errors.push('lowercaseToCanonicalIdentities_mismatch');
        }
      } catch (e) {
        console.error(e);
        errors.push('FETCH_ERROR');
      }

      if (errors.length > 0) {
        identityErrors.push({ identity: identityList[i], errors });
      }

      await fs.promises.writeFile(
        REPORT_PATH,
        JSON.stringify(
          {
            identityErrors,
            identityLastProcessedIndex: i,
            dappsErrors,
            dappsLastProcessedIndex: dappsStartIndex,
          },
          null,
          2
        )
      );
    }

    for (let i = 0; i < dappsList.length; i++) {
      const errors = [];
      console.log(`Checking dapp ${dappsList[i]}...`);

      if (!identityList.includes(dappsList[i])) {
        console.log('ERROR: dapp missing in identities list');
        errors.push('dapp_missing');
      }

      if (dappsList.slice(i + 1).includes(dappsList[i])) {
        console.log('ERROR: dapp duplicate');
        errors.push('dapp_duplicate');
      }

      if (errors.length > 0) {
        dappsErrors.push({ dapp: dappsList[i], errors });
      }
    }

    await fs.promises.writeFile(
      REPORT_PATH,
      JSON.stringify(
        {
          identityErrors,
          identityLastProcessedIndex: identityList.length - 1,
          dappsErrors,
          dappsLastProcessedIndex: dappsList.length - 1,
        },
        null,
        2
      )
    );

    console.log(
      `Check completed, identity errors: ${identityErrors.length}, dapps errors: ${dappsErrors.length}`
    );
  });
// 1. identityToOwner[handle] not empty
// 2. ownerToIdentity[owner] == identity
// 3. check identityToCommPublicKey.part1, part2 not empty
// 4. lowercaseToCanonicalIdentities[identity.toLower()] == identity
// 5. dappsList[i] exists in identities
// 6. no duplicates in dappsList
