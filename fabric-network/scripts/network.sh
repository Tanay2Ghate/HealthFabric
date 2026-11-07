#!/usr/bin/env bash
# ==============================================================================
# network.sh – HealthChain Hyperledger Fabric 2.5 network lifecycle script
# Supports Linux and macOS.
# Usage:
#   ./network.sh up      – generate crypto, start network, create + join channel
#   ./network.sh down    – stop and remove all containers / volumes
#   ./network.sh restart – down then up
# ==============================================================================
set -euo pipefail

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$FABRIC_DIR/config"
DOCKER_DIR="$FABRIC_DIR/docker"
ORGANIZATIONS_DIR="$FABRIC_DIR/organizations"
CHANNEL_ARTIFACTS_DIR="$FABRIC_DIR/channel-artifacts"

# ── Settings ──────────────────────────────────────────────────────────────────
CHANNEL_NAME="healthchainchannel"
CHANNEL_PROFILE="HealthChainChannel"
GENESIS_PROFILE="HealthChainGenesis"
ORDERER_CA="$ORGANIZATIONS_DIR/ordererOrganizations/orderer.healthchain.com/orderers/orderer.orderer.healthchain.com/msp/tlscacerts/tlsca.orderer.healthchain.com-cert.pem"
ORDERER_ADDRESS="orderer.healthchain.com:7050"
FABRIC_CFG_PATH="$CONFIG_DIR"
export FABRIC_CFG_PATH

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Prerequisite check ────────────────────────────────────────────────────────
check_prereqs() {
  info "Checking prerequisites…"
  for tool in docker cryptogen configtxgen; do
    command -v "$tool" &>/dev/null || error "$tool not found. Please install Hyperledger Fabric binaries and ensure Docker is running."
  done
  docker info &>/dev/null || error "Docker daemon is not reachable."
  info "All prerequisites satisfied."
}

# ── Pull Docker images ────────────────────────────────────────────────────────
pull_images() {
  info "Pulling Hyperledger Fabric Docker images (this may take a while)…"
  for img in \
    hyperledger/fabric-tools:2.5 \
    hyperledger/fabric-orderer:2.5 \
    hyperledger/fabric-peer:2.5 \
    hyperledger/fabric-ca:1.5 \
    couchdb:3.3; do
    info "  pulling $img"
    docker pull "$img"
  done
  info "All images pulled."
}

# ── Generate crypto material ───────────────────────────────────────────────────
generate_crypto() {
  info "Generating crypto material with cryptogen…"
  mkdir -p "$ORGANIZATIONS_DIR"
  cryptogen generate \
    --config="$CONFIG_DIR/crypto-config.yaml" \
    --output="$ORGANIZATIONS_DIR"
  info "Crypto material generated → $ORGANIZATIONS_DIR"
}

# ── Generate channel artifacts ─────────────────────────────────────────────────
generate_artifacts() {
  info "Creating channel artifacts directory…"
  mkdir -p "$CHANNEL_ARTIFACTS_DIR"

  info "Generating genesis block (profile: $GENESIS_PROFILE)…"
  configtxgen \
    -profile "$GENESIS_PROFILE" \
    -channelID system-channel \
    -outputBlock "$CHANNEL_ARTIFACTS_DIR/genesis.block"

  info "Generating channel creation transaction…"
  configtxgen \
    -profile "$CHANNEL_PROFILE" \
    -outputCreateChannelTx "$CHANNEL_ARTIFACTS_DIR/${CHANNEL_NAME}.tx" \
    -channelID "$CHANNEL_NAME"

  # Anchor peer updates
  for org_msp in Org1MSP Org2MSP Org3MSP; do
    info "Generating anchor peer update for $org_msp…"
    configtxgen \
      -profile "$CHANNEL_PROFILE" \
      -outputAnchorPeersUpdate "$CHANNEL_ARTIFACTS_DIR/${org_msp}anchors.tx" \
      -channelID "$CHANNEL_NAME" \
      -asOrg "$org_msp"
  done
  info "Channel artifacts generated → $CHANNEL_ARTIFACTS_DIR"
}

# ── Start network ─────────────────────────────────────────────────────────────
start_network() {
  info "Starting HealthChain Fabric network with Docker Compose…"
  docker compose -f "$DOCKER_DIR/docker-compose-fabric.yaml" up -d
  info "Waiting 10 seconds for containers to initialise…"
  sleep 10
  info "Network is up."
}

# ── Create channel ─────────────────────────────────────────────────────────────
create_channel() {
  info "Creating channel '$CHANNEL_NAME'…"
  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_LOCALMSPID=Org1MSP
  export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/peerOrganizations/hospitala.healthchain.com/peers/peer0.hospitala.healthchain.com/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/hospitala.healthchain.com/users/Admin@hospitala.healthchain.com/msp"
  export CORE_PEER_ADDRESS=localhost:7051

  peer channel create \
    -o "$ORDERER_ADDRESS" \
    -c "$CHANNEL_NAME" \
    -f "$CHANNEL_ARTIFACTS_DIR/${CHANNEL_NAME}.tx" \
    --outputBlock "$CHANNEL_ARTIFACTS_DIR/${CHANNEL_NAME}.block" \
    --tls --cafile "$ORDERER_CA"
  info "Channel '$CHANNEL_NAME' created."
}

# ── Join all peers ─────────────────────────────────────────────────────────────
join_peers() {
  CHANNEL_BLOCK="$CHANNEL_ARTIFACTS_DIR/${CHANNEL_NAME}.block"

  # Hospital A – peer0
  info "Joining peer0.hospitala to channel…"
  export CORE_PEER_LOCALMSPID=Org1MSP
  export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/peerOrganizations/hospitala.healthchain.com/peers/peer0.hospitala.healthchain.com/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/hospitala.healthchain.com/users/Admin@hospitala.healthchain.com/msp"
  export CORE_PEER_ADDRESS=localhost:7051
  peer channel join -b "$CHANNEL_BLOCK"

  # Hospital A – peer1
  info "Joining peer1.hospitala to channel…"
  export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/peerOrganizations/hospitala.healthchain.com/peers/peer1.hospitala.healthchain.com/tls/ca.crt"
  export CORE_PEER_ADDRESS=localhost:7061
  peer channel join -b "$CHANNEL_BLOCK"

  # Hospital B – peer0
  info "Joining peer0.hospitalb to channel…"
  export CORE_PEER_LOCALMSPID=Org2MSP
  export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/peerOrganizations/hospitalb.healthchain.com/peers/peer0.hospitalb.healthchain.com/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/hospitalb.healthchain.com/users/Admin@hospitalb.healthchain.com/msp"
  export CORE_PEER_ADDRESS=localhost:8051
  peer channel join -b "$CHANNEL_BLOCK"

  # Hospital B – peer1
  info "Joining peer1.hospitalb to channel…"
  export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/peerOrganizations/hospitalb.healthchain.com/peers/peer1.hospitalb.healthchain.com/tls/ca.crt"
  export CORE_PEER_ADDRESS=localhost:8061
  peer channel join -b "$CHANNEL_BLOCK"

  # DiagnosticLab – peer0
  info "Joining peer0.diaglab to channel…"
  export CORE_PEER_LOCALMSPID=Org3MSP
  export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/peerOrganizations/diaglab.healthchain.com/peers/peer0.diaglab.healthchain.com/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/diaglab.healthchain.com/users/Admin@diaglab.healthchain.com/msp"
  export CORE_PEER_ADDRESS=localhost:9051
  peer channel join -b "$CHANNEL_BLOCK"

  # DiagnosticLab – peer1
  info "Joining peer1.diaglab to channel…"
  export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/peerOrganizations/diaglab.healthchain.com/peers/peer1.diaglab.healthchain.com/tls/ca.crt"
  export CORE_PEER_ADDRESS=localhost:9061
  peer channel join -b "$CHANNEL_BLOCK"

  info "All peers joined channel '$CHANNEL_NAME'."
}

# ── Update anchor peers ────────────────────────────────────────────────────────
update_anchors() {
  # Hospital A
  info "Updating anchor peer for HospitalA (Org1MSP)…"
  export CORE_PEER_LOCALMSPID=Org1MSP
  export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/peerOrganizations/hospitala.healthchain.com/peers/peer0.hospitala.healthchain.com/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/hospitala.healthchain.com/users/Admin@hospitala.healthchain.com/msp"
  export CORE_PEER_ADDRESS=localhost:7051
  peer channel update \
    -o "$ORDERER_ADDRESS" \
    -c "$CHANNEL_NAME" \
    -f "$CHANNEL_ARTIFACTS_DIR/Org1MSPanchors.tx" \
    --tls --cafile "$ORDERER_CA"

  # Hospital B
  info "Updating anchor peer for HospitalB (Org2MSP)…"
  export CORE_PEER_LOCALMSPID=Org2MSP
  export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/peerOrganizations/hospitalb.healthchain.com/peers/peer0.hospitalb.healthchain.com/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/hospitalb.healthchain.com/users/Admin@hospitalb.healthchain.com/msp"
  export CORE_PEER_ADDRESS=localhost:8051
  peer channel update \
    -o "$ORDERER_ADDRESS" \
    -c "$CHANNEL_NAME" \
    -f "$CHANNEL_ARTIFACTS_DIR/Org2MSPanchors.tx" \
    --tls --cafile "$ORDERER_CA"

  # DiagnosticLab
  info "Updating anchor peer for DiagnosticLab (Org3MSP)…"
  export CORE_PEER_LOCALMSPID=Org3MSP
  export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/peerOrganizations/diaglab.healthchain.com/peers/peer0.diaglab.healthchain.com/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/diaglab.healthchain.com/users/Admin@diaglab.healthchain.com/msp"
  export CORE_PEER_ADDRESS=localhost:9051
  peer channel update \
    -o "$ORDERER_ADDRESS" \
    -c "$CHANNEL_NAME" \
    -f "$CHANNEL_ARTIFACTS_DIR/Org3MSPanchors.tx" \
    --tls --cafile "$ORDERER_CA"

  info "Anchor peers updated."
}

# ── Bring down network ─────────────────────────────────────────────────────────
network_down() {
  info "Stopping HealthChain Fabric network…"
  docker compose -f "$DOCKER_DIR/docker-compose-fabric.yaml" down --volumes --remove-orphans
  info "Removing generated crypto material and channel artifacts…"
  rm -rf "$ORGANIZATIONS_DIR" "$CHANNEL_ARTIFACTS_DIR"
  info "Network stopped and cleaned."
}

# ── Main ───────────────────────────────────────────────────────────────────────
MODE="${1:-up}"
case "$MODE" in
  up)
    check_prereqs
    pull_images
    generate_crypto
    generate_artifacts
    start_network
    create_channel
    join_peers
    update_anchors
    info "✅  HealthChain network is fully operational on channel '$CHANNEL_NAME'."
    ;;
  down)
    network_down
    ;;
  restart)
    network_down
    check_prereqs
    pull_images
    generate_crypto
    generate_artifacts
    start_network
    create_channel
    join_peers
    update_anchors
    info "✅  HealthChain network restarted."
    ;;
  *)
    echo "Usage: $0 [up|down|restart]"
    exit 1
    ;;
esac
