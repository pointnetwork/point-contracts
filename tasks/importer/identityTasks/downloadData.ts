import { Identity } from '../../../typechain';

// It doesn't make much sense to make bigger steps - step takes longer and increases the
// risk of failure
const MAX_BLOCK_RANGE = 20000;

export const downloadData = async ({
  contract,
  fromBlock,
  toBlock,
}: {
  contract: Identity;
  fromBlock: number;
  toBlock: number;
}) => {
  console.log(
    `Starting data download, from block ${fromBlock} to block ${toBlock}`
  );
  const identitiesFilter = contract.filters.IdentityRegistered();

  const identities = [];
  const ikv = [];

  for (let i = fromBlock; i < toBlock; i += MAX_BLOCK_RANGE) {
    const toBlockStep = Math.min(i + MAX_BLOCK_RANGE - 1, toBlock);
    console.log(`Making step from block ${i} to block ${toBlockStep}`);

    const identityCreatedEvents = await contract.queryFilter(
      identitiesFilter,
      i,
      toBlockStep
    );

    console.log(
      `Found ${identityCreatedEvents.filter((e: any) => !!e.args).length} identities`
    );

    identities.push(
      ...identityCreatedEvents
        .filter((e: any) => !!e.args)
        .map((e: any) => {
          const { handle, identityOwner, commPublicKey } = e.args!;
          // console.log(`migrating handle ${handle} from ${identityOwner}`);
          return {
            handle,
            owner: identityOwner,
            keyPart1: commPublicKey.part1,
            keyPart2: commPublicKey.part2,
            blockNumber: e.blockNumber,
          };
        })
    );

    const ikvSetFilter = contract.filters.IKVSet();
    const ikvSetEvents = await contract.queryFilter(
      ikvSetFilter,
      i,
      toBlockStep
    );

    console.log(`Found ${ikvSetEvents.filter((e: any) => !!e.args).length} ikv`);

    ikv.push(
      ...ikvSetEvents
        .filter((e: any) => !!e.args)
        .map((e: any) => {
          const { identity, key, value, version } = e.args!;
          // console.log(`migrating key ${key} with value of ${value}`);
          return {
            handle: identity,
            key,
            value,
            version,
            blockNumber: e.blockNumber,
          };
        })
    );
  }

  console.log(`Found ${identities.length} identities in total`);
  console.log(`Found ${ikv.length} IKV parameters in total`);

  return {
    identities,
    ikv,
  };
};
