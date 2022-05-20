import axios from 'axios';
import { https } from 'follow-redirects';
import { delay } from './delay';

const HEALTH_CHECK_RETRY_TIME = 3; // seconds

export async function nodePointHealthCheck(
  proxyPort: number,
  retryCount = 10
): Promise<boolean> {
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });
  try {
    await axios.get('https://point/v1/api/status/meta', {
      timeout: 3000,
      proxy: {
        host: '0.0.0.0',
        port: proxyPort,
        protocol: 'https',
      },
      httpsAgent,
    });
    return true;
  } catch (error: any) {
    console.error(`Health check have failed, retries left: ${retryCount}`);
    await delay(HEALTH_CHECK_RETRY_TIME);
    if (retryCount <= 0) {
      return false;
    }
    return nodePointHealthCheck(proxyPort, retryCount - 1);
  }
}
