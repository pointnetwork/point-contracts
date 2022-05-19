import { exec } from 'child_process';

export function startPointNode({
  proxyPort,
  apiPort,
  datadirPath,
  platform,
}: {
  proxyPort: number;
  apiPort: number;
  datadirPath: string;
  platform: string;
}) {
  const pointPath = `./opt/point/bin/${platform}/point`;
  const pointCommand = `chmod 777 ${pointPath} && DATADIR=${datadirPath} ZPROXY_PORT=${proxyPort} NODE_ENV=production API_PORT=${apiPort} ${pointPath}`;
  const pointserver = exec(pointCommand);
  pointserver.stderr?.pipe(process.stderr);
  pointserver.stdout?.pipe(process.stdout);
  return pointserver;
}
