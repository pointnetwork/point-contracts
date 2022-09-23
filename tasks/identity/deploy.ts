import { task } from 'hardhat/config';

// A simple task to deploy a new identity contract, e.g. for testing
task('deploy').setAction(async (taskArgs, hre) => {
  const { ethers, upgrades } = hre;

  const contractF = await ethers.getContractFactory('Identity');
  const proxy = await upgrades.deployProxy(contractF);
  await proxy.deployed();

  console.log('Done', proxy.address);
});
