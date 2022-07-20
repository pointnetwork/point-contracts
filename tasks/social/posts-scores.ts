import { task } from "hardhat/config";
import * as https from 'https'
import fetch from "node-fetch";
import FormData from "form-data";

/**
 *    This task is intented to set Social point weight data to sort posts based on weight
 * 
 *    Usage:
 *    To set the weights data into dev environment, use the folowing command:
 *          
 *          export BLOCKCHAIN_HOST=localhost
 *          export POINT_NODE=localhost
 *          export POINT_NODE_PORT=65501
 *          npx hardhat posts-scores 0xD61e5eFcB183418E1f6e53D0605eed8167F90D4d 2 2 4 0 1 5 --network development
 * 
 *    To set the weights data into prod environment, use the folowing command:
 * 
 *          export POINT_NODE=localhost
 *          export POINT_NODE_PORT=8666
 *          npx hardhat posts-scores $(cat ../pointnetwork/config/default.yaml | grep "identity_contract_address" | awk '{ print $2 }' | sed -e 's/"//g')  2 2 4 0 1 5 --network ynet
 */
 
https.globalAgent.options.rejectUnauthorized = false;

const getContract = async (ethers:any, identityAddress:string, appHandle:string) : Promise<any> => {
    const identity = await ethers.getContractAt("Identity", identityAddress);
    const contractKey = await identity.ikvList(appHandle, 0);
    const contractAddress = await identity.ikvGet(appHandle, contractKey);
    const abiKey = await identity.ikvList(appHandle, 1);
    const contractAbi = await identity.ikvGet(appHandle, abiKey);
    https.globalAgent.options.rejectUnauthorized = false;    
    const result = await fetch(`https://${process.env.POINT_NODE || 'localhost'}:${process.env.POINT_NODE_PORT || 8666}/_storage/0x${contractAbi}`);        
    const abi = (await result.json()).abi;
    const instance = (await ethers.getContractAt(abi, contractAddress)) as any;
    return { instance, contractAddress};
}

task("posts-scores", "Will set the scores (or multipliers) for weight calculation of each post")
  .addPositionalParam("contract", 'Identity contract address')
  .addPositionalParam("likes", 'Multiplier for likes')
  .addPositionalParam("dislikes","Multiplier for dislikes")
  .addPositionalParam("age", "Multiplier for post age (based on createdAt)")
  .addPositionalParam("threshold", "Threshold (post with less that this value should not been seen)")
  .addPositionalParam("initial", "Initial weight of each post")
  .addPositionalParam("follow", "Weight for post which autors are following")
  .setAction(async (taskArgs, hre) => {
    const ethers = hre.ethers;
    const zappHandle = 'social';
    if(!ethers.utils.isAddress(taskArgs.contract)) {
        console.log('Contract address not valid.');
        return false;
    }

    const { instance: pointSocial, contractAddress } = await getContract(ethers, taskArgs.contract, zappHandle);

    try {
        await pointSocial.setWeights(taskArgs.likes, taskArgs.dislikes, taskArgs.age, taskArgs.threshold, taskArgs.initial, taskArgs.follow);
    }
    catch(error) {
        console.log(error);
    }
  });
