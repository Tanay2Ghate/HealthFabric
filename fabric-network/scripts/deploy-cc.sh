#!/usr/bin/env bash
# ==============================================================================
# deploy-cc.sh – Deploys the healthchain-cc chaincode on all three organisations
# using the Fabric 2.x lifecycle.
#
# Prerequisites:
#   • HealthChain network is running (./network.sh up has completed)
#   • Fabric peer binary is on PATH
#   • FABRIC_CFG_PATH points to the config directory
#   • Run from the fabric-network/scripts directory or set SCRIPT_DIR manually
#
# Usage:  ./deploy-cc.sh
# ==============================================================================
set -euo pipefail

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$FABRIC_DIR/config"
ORGANIZATIONS_DIR="$FABRIC_DIR/organizations"
CHANNEL_ARTIFACTS_DIR="$FABRIC_DIR/channel-artifacts"
CC_SRC_PATH="$(dirname "$FABRIC_DIR")/chaincode/healthchain-cc"

# ── Chaincode settings ────────────────────────────────────────────────────────
CC_NAME="healthchain-cc"
CC_VERSION="1.0"
CC_SEQUENCE=1
CC_LANG="golang"           # change to "node" or "java" if applicable
CHANNEL_NAME="healthchainchannel"
ORDERER_ADDRESS="orderer.healthchain.com:7050"
ORDERER_CA="$ORGANIZATIONS_DIR/ordererOrganizations/orderer.healthchain.com/orderers/orderer.orderer.healthchain.com/msp/tlscacerts/tlsca.orderer.healthchain.com-cert.pem"

export FABRIC_CFG_PATH="$CONFIG_DIR"

# ── Colour helpers ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Set peer environment helper ───────────────────────────────────────────────
set_peer_env() {
  local msp_id="$1" org_domain="$2" peer_host="$3" peer_port="$4"
  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_LOCALMSPID="$msp_id"
  export CORE_PEER_ADDRESS="localhost:${peer_port}"
  export CORE_PEER_TLS_ROOTCERT_FILE="$ORGANIZATIONS_DIR/peerOrganizations/${org_domain}/peers/${peer_host}.${org_domain}/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$ORGANIZATIONS_DIR/peerOrganizations/${org_domain}/users/Admin@${org_domain}/msp"
}

# ── 1. Package chaincode ──────────────────────────────────────────────────────
package_chaincode() {
  info "Step 1: Packaging chaincode '$CC_NAME' from $CC_SRC_PATH…"
  if [[ ! -d "$CC_SRC_PATH" ]]; then
    error "Chaincode source not found at $CC_SRC_PATH"
  fi
  set_peer_env "Org1MSP" "hospitala.healthchain.com" "peer0" 7051
  peer lifecycle chaincode package "${CC_NAME}.tar.gz" \
    --path "$CC_SRC_PATH" \
    --lang "$CC_LANG" \
    --label "${CC_NAME}_${CC_VERSION}"
  info "Package created: ${CC_NAME}.tar.gz"
}

# ── 2. Install on all peers ───────────────────────────────────────────────────
install_chaincode() {
  info "Step 2: Installing chaincode on all peers…"

  declare -a PEERS=(
    "Org1MSP hospitala.healthchain.com peer0 7051"
    "Org1MSP hospitala.healthchain.com peer1 7061"
    "Org2MSP hospitalb.healthchain.com peer0 8051"
    "Org2MSP hospitalb.healthchain.com peer1 8061"
    "Org3MSP diaglab.healthchain.com   peer0 9051"
    "Org3MSP diaglab.healthchain.com   peer1 9061"
  )

  for entry in "${PEERS[@]}"; do
    read -r msp domain host port <<< "$entry"
    info "  Installing on ${host}.${domain} (port ${port})…"
    set_peer_env "$msp" "$domain" "$host" "$port"
    peer lifecycle chaincode install "${CC_NAME}.tar.gz"
  done
  info "Chaincode installed on all peers."
}

# ── 3. Query installed package ID ─────────────────────────────────────────────
get_package_id() {
  info "Step 3: Retrieving installed package ID…"
  set_peer_env "Org1MSP" "hospitala.healthchain.com" "peer0" 7051
  CC_PACKAGE_ID=$(peer lifecycle chaincode queryinstalled \
    --output json \
    | python3 -c "
import json, sys
data = json.load(sys.stdin)
for cc in data.get('installed_chaincodes', []):
    if cc['label'] == '${CC_NAME}_${CC_VERSION}':
        print(cc['package_id'])
        break
")
  if [[ -z "$CC_PACKAGE_ID" ]]; then
    error "Could not determine package ID for ${CC_NAME}_${CC_VERSION}"
  fi
  info "Package ID: $CC_PACKAGE_ID"
  export CC_PACKAGE_ID
}

# ── 4. Approve for each organisation ─────────────────────────────────────────
approve_chaincode() {
  info "Step 4: Approving chaincode definition for each organisation…"

  # Hospital A – Org1MSP
  info "  Approving for HospitalA (Org1MSP)…"
  set_peer_env "Org1MSP" "hospitala.healthchain.com" "peer0" 7051
  peer lifecycle chaincode approveformyorg \
    -o "$ORDERER_ADDRESS" \
    --tls --cafile "$ORDERER_CA" \
    --channelID "$CHANNEL_NAME" \
    --name "$CC_NAME" \
    --version "$CC_VERSION" \
    --package-id "$CC_PACKAGE_ID" \
    --sequence "$CC_SEQUENCE"

  # Hospital B – Org2MSP
  info "  Approving for HospitalB (Org2MSP)…"
  set_peer_env "Org2MSP" "hospitalb.healthchain.com" "peer0" 8051
  peer lifecycle chaincode approveformyorg \
    -o "$ORDERER_ADDRESS" \
    --tls --cafile "$ORDERER_CA" \
    --channelID "$CHANNEL_NAME" \
    --name "$CC_NAME" \
    --version "$CC_VERSION" \
    --package-id "$CC_PACKAGE_ID" \
    --sequence "$CC_SEQUENCE"

  # DiagnosticLab – Org3MSP
  info "  Approving for DiagnosticLab (Org3MSP)…"
  set_peer_env "Org3MSP" "diaglab.healthchain.com" "peer0" 9051
  peer lifecycle chaincode approveformyorg \
    -o "$ORDERER_ADDRESS" \
    --tls --cafile "$ORDERER_CA" \
    --channelID "$CHANNEL_NAME" \
    --name "$CC_NAME" \
    --version "$CC_VERSION" \
    --package-id "$CC_PACKAGE_ID" \
    --sequence "$CC_SEQUENCE"

  info "All organisations have approved the chaincode definition."
}

# ── 5. Check commit readiness ─────────────────────────────────────────────────
check_commit_readiness() {
  info "Step 5: Checking commit readiness…"
  set_peer_env "Org1MSP" "hospitala.healthchain.com" "peer0" 7051
  peer lifecycle chaincode checkcommitreadiness \
    --channelID "$CHANNEL_NAME" \
    --name "$CC_NAME" \
    --version "$CC_VERSION" \
    --sequence "$CC_SEQUENCE" \
    --tls --cafile "$ORDERER_CA" \
    --output json
}

# ── 6. Commit chaincode definition ────────────────────────────────────────────
commit_chaincode() {
  info "Step 6: Committing chaincode definition to channel '$CHANNEL_NAME'…"
  set_peer_env "Org1MSP" "hospitala.healthchain.com" "peer0" 7051

  ORG1_CA="$ORGANIZATIONS_DIR/peerOrganizations/hospitala.healthchain.com/peers/peer0.hospitala.healthchain.com/tls/ca.crt"
  ORG2_CA="$ORGANIZATIONS_DIR/peerOrganizations/hospitalb.healthchain.com/peers/peer0.hospitalb.healthchain.com/tls/ca.crt"
  ORG3_CA="$ORGANIZATIONS_DIR/peerOrganizations/diaglab.healthchain.com/peers/peer0.diaglab.healthchain.com/tls/ca.crt"

  peer lifecycle chaincode commit \
    -o "$ORDERER_ADDRESS" \
    --tls --cafile "$ORDERER_CA" \
    --channelID "$CHANNEL_NAME" \
    --name "$CC_NAME" \
    --version "$CC_VERSION" \
    --sequence "$CC_SEQUENCE" \
    --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_CA" \
    --peerAddresses localhost:8051 --tlsRootCertFiles "$ORG2_CA" \
    --peerAddresses localhost:9051 --tlsRootCertFiles "$ORG3_CA"

  info "Chaincode '$CC_NAME' committed to channel '$CHANNEL_NAME'."
}

# ── 7. Verify installation ────────────────────────────────────────────────────
verify_chaincode() {
  info "Step 7: Verifying committed chaincode…"
  set_peer_env "Org1MSP" "hospitala.healthchain.com" "peer0" 7051
  peer lifecycle chaincode querycommitted \
    --channelID "$CHANNEL_NAME" \
    --name "$CC_NAME" \
    --tls --cafile "$ORDERER_CA" \
    --output json

  info "Querying installed chaincode on each org's peer0…"
  for entry in \
    "Org1MSP hospitala.healthchain.com peer0 7051" \
    "Org2MSP hospitalb.healthchain.com peer0 8051" \
    "Org3MSP diaglab.healthchain.com   peer0 9051"; do
    read -r msp domain host port <<< "$entry"
    info "  ${host}.${domain}:"
    set_peer_env "$msp" "$domain" "$host" "$port"
    peer lifecycle chaincode queryinstalled --output json | \
      python3 -c "
import json, sys
data = json.load(sys.stdin)
for cc in data.get('installed_chaincodes', []):
    if '${CC_NAME}' in cc['label']:
        print('    label:', cc['label'])
        print('    package_id:', cc['package_id'])
"
  done
  info "✅  Chaincode '$CC_NAME' v${CC_VERSION} is deployed and committed on '$CHANNEL_NAME'."
}

# ── Main ───────────────────────────────────────────────────────────────────────
info "=== HealthChain Chaincode Deployment ==="
info "Chaincode : $CC_NAME v$CC_VERSION (sequence $CC_SEQUENCE)"
info "Channel   : $CHANNEL_NAME"
info "Source    : $CC_SRC_PATH"
echo

package_chaincode
install_chaincode
get_package_id
approve_chaincode
check_commit_readiness
commit_chaincode
verify_chaincode

info "=== Deployment complete ==="
