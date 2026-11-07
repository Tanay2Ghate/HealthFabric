'use strict';

/**
 * HealthChain Chaincode Entry Point
 *
 * Exports the HealthChainContract so that Hyperledger Fabric's
 * fabric-shim bootstrapper can discover and register it.
 */

const { HealthChainContract } = require('./lib/healthchainContract');

module.exports.HealthChainContract = HealthChainContract;
module.exports.contracts = [HealthChainContract];
