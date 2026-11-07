'use strict';

/**
 * @module config/fabric
 * Hyperledger Fabric Gateway connection configuration.
 *
 * Returns `{ gateway, network, contract }` for the healthchain-cc chaincode
 * on healthchainchannel.
 *
 * When FABRIC_MOCK_MODE=true (or certificate files are missing) the returned
 * objects carry `_mockMode: true` and all calls fall through to fabricService
 * mock implementations.
 */

const path = require('path');
const fs = require('fs');
const grpc = require('@grpc/grpc-js');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');
const crypto = require('crypto');
const logger = require('../utils/logger');

const CHANNEL_NAME = process.env.FABRIC_CHANNEL_NAME || 'healthchainchannel';
const CHAINCODE_NAME = process.env.FABRIC_CHAINCODE_NAME || 'healthchain-cc';
const MSP_ID = process.env.FABRIC_MSP_ID || 'HospitalAMSP';
const PEER_ENDPOINT = process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051';
const PEER_HOST_ALIAS = process.env.FABRIC_PEER_HOST_ALIAS || 'peer0.hospitala.example.com';
const MOCK_MODE = process.env.FABRIC_MOCK_MODE === 'true';

// ---------------------------------------------------------------------------
// Mock objects – returned when FABRIC_MOCK_MODE=true
// ---------------------------------------------------------------------------
const mockContract = {
  _mockMode: true,
  async submitTransaction(name, ...args) {
    logger.info('[MOCK] Fabric submitTransaction', { name, args });
    return Buffer.from(
      JSON.stringify({ _mockMode: true, txId: `MOCK-TX-${Date.now()}`, name, args })
    );
  },
  async evaluateTransaction(name, ...args) {
    logger.info('[MOCK] Fabric evaluateTransaction', { name, args });
    return Buffer.from(
      JSON.stringify({ _mockMode: true, name, args, result: null })
    );
  },
};

const mockNetwork = {
  _mockMode: true,
  getContract() {
    return mockContract;
  },
};

const mockGateway = {
  _mockMode: true,
  getNetwork() {
    return mockNetwork;
  },
  close() {},
};

// ---------------------------------------------------------------------------
// Read a file from the given path (absolute or relative to backend/)
// ---------------------------------------------------------------------------
function readCertFile(envPath, label) {
  if (!envPath) throw new Error(`${label} path is not set in environment`);
  const resolved = path.isAbsolute(envPath)
    ? envPath
    : path.resolve(__dirname, '..', '..', envPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} file not found at: ${resolved}`);
  }
  return fs.readFileSync(resolved);
}

// ---------------------------------------------------------------------------
// Build a gRPC client targeting the Fabric peer
// ---------------------------------------------------------------------------
async function newGrpcConnection(tlsCert) {
  const tlsCredentials = grpc.credentials.createSsl(tlsCert);
  return new grpc.Client(PEER_ENDPOINT, tlsCredentials, {
    'grpc.ssl_target_name_override': PEER_HOST_ALIAS,
    'grpc.keepalive_time_ms': 120000,
    'grpc.keepalive_timeout_ms': 20000,
    'grpc.keepalive_permit_without_calls': 1,
  });
}

// ---------------------------------------------------------------------------
// Build a Fabric identity from cert + key buffers
// ---------------------------------------------------------------------------
function newIdentity(certBuffer) {
  return {
    mspId: MSP_ID,
    credentials: certBuffer,
  };
}

function newSigner(keyBuffer) {
  const privateKey = crypto.createPrivateKey(keyBuffer);
  return signers.newPrivateKeySigner(privateKey);
}

// ---------------------------------------------------------------------------
// connectToFabric()
// ---------------------------------------------------------------------------

/**
 * Establish a Fabric Gateway connection.
 *
 * @returns {Promise<{gateway: object, network: object, contract: object, _mockMode: boolean}>}
 */
async function connectToFabric() {
  if (MOCK_MODE) {
    logger.warn('Fabric MOCK MODE enabled – no real Fabric network calls will be made');
    return { gateway: mockGateway, network: mockNetwork, contract: mockContract, _mockMode: true };
  }

  let client;
  let gateway;

  try {
    const tlsCert = readCertFile(process.env.TLS_CERT_PATH, 'TLS certificate');
    const certBuffer = readCertFile(process.env.ADMIN_CERT_PATH, 'Admin certificate');
    const keyBuffer = readCertFile(process.env.ADMIN_KEY_PATH, 'Admin private key');

    client = await newGrpcConnection(tlsCert);

    gateway = connect({
      client,
      identity: newIdentity(certBuffer),
      signer: newSigner(keyBuffer),
      hash: hash.sha256,
      // Default timeouts for proposal and transaction submissions
      evaluateOptions: () => ({ deadline: Date.now() + 10_000 }),
      endorseOptions: () => ({ deadline: Date.now() + 30_000 }),
      submitOptions: () => ({ deadline: Date.now() + 30_000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 60_000 }),
    });

    const network = gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME);

    logger.info('Fabric Gateway connected', {
      peer: PEER_ENDPOINT,
      channel: CHANNEL_NAME,
      chaincode: CHAINCODE_NAME,
      mspId: MSP_ID,
    });

    return { gateway, network, contract, _mockMode: false };
  } catch (err) {
    if (gateway) {
      try { gateway.close(); } catch (_) {}
    }
    if (client) {
      try { client.close(); } catch (_) {}
    }

    logger.error('Fabric Gateway connection failed – falling back to MOCK MODE', {
      error: err.message,
    });

    // Graceful degradation: return mock mode so the backend can still serve
    // non-blockchain features while Fabric is unavailable.
    return { gateway: mockGateway, network: mockNetwork, contract: mockContract, _mockMode: true };
  }
}

module.exports = { connectToFabric, CHANNEL_NAME, CHAINCODE_NAME };
