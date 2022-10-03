import { task } from 'hardhat/config';
import fs from 'fs';
import path from 'path';

const FILE_PATH = path.resolve('./resources/identities.json'); // TODO

task('download-identities-data')
  .addPositionalParam('contract', 'Identity contract source address')
  .setAction(async (args, hre) => {
    const contract = await hre.ethers.getContractAt('Identity', args.contract);

    const identitiesLength = (await contract.getIdentitiesLength()).toNumber();
    const dappsLength = (await contract.getDappsLength()).toNumber();
    console.log('Identities length: ', identitiesLength);

    let startIndex = 0;
    let identities = [];
    let dapps = [];
    if (fs.existsSync(FILE_PATH)) {
      console.log('Found saved results');
      const contents = JSON.parse(
        await fs.promises.readFile(FILE_PATH, 'utf8')
      );
      startIndex = contents.lastProcessedIndex + 1;
      identities = contents.identities;
      dapps = contents.dapps;
    }

    for (let i = startIndex; i < identitiesLength; i++) {
      console.log(`Getting Identity ${i}...`);
      if (i > 0 && i % 100 === 0) {
        console.log('Saving intermediate results');
        await fs.promises.writeFile(
          FILE_PATH,
          JSON.stringify(
            {
              identities,
              dapps,
              lastProcessedIndex: i,
            },
            null,
            2
          )
        );
      }
      const identity = await contract.identityList(i);
      identities.push(identity);
      if (i < dappsLength) {
        console.log(`Getting Dapp ${i}...`);
        const dapp = await contract.dappsList(i);
        dapps.push(dapp);
      }
    }

    await fs.promises.writeFile(
      FILE_PATH,
      JSON.stringify(
        { identities, dapps, lastProcessedIndex: identitiesLength - 1 },
        null,
        2
      )
    );

    console.log('Done');
  });
