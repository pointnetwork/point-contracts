import { resolve as pathResolve } from 'path';
import { writeFile } from 'fs/promises';
import { getPointNodeInfo } from './utils/getPointNodeInfo';
import { downloadPointNode } from './utils/downloadPointNode';
import { startPointNode } from './utils/startPointNode';
import { nodePointHealthCheck } from './utils/nodePointHealthCheck';
import { makeSurePathExists } from './utils/makeSurePathExists';

const PLATFORM = 'linux';
const PROXY_PORT = 8666;
const API_PORT = 1112;

if (!process.env.POINT_KEY_PHRASE) {
  console.log('You should set environment variable POINT_KEY_PHRASE');
  // eslint-disable-next-line no-process-exit
  process.exit(1);
}

const datadirPath = '/home/runner/.point';

async function main() {
  const keystorePath = `${datadirPath}/keystore`;
  await makeSurePathExists(keystorePath, true);
  await writeFile(
    pathResolve(keystorePath, 'key.json'),
    process.env.POINT_KEY_PHRASE as string
  );
  const { assetsUrl } = await getPointNodeInfo();
  await downloadPointNode(assetsUrl, PLATFORM);
  const { pid } = startPointNode({
    platform: PLATFORM,
    proxyPort: PROXY_PORT,
    apiPort: API_PORT,
    datadirPath,
  });
  console.log({ pid });
  if (await nodePointHealthCheck(PROXY_PORT, 20)) {
    console.log('Point node is up and running');
    // eslint-disable-next-line no-process-exit
    process.exit(0);
  } else {
    console.error(
      'Healtcheck for new point node has failed after many retries'
    );
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  }
}

main();
