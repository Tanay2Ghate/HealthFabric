# ==============================================================================
# network.ps1 – HealthChain Hyperledger Fabric 2.5 network lifecycle script
# Windows PowerShell equivalent of network.sh
# Usage:
#   .\network.ps1 up      – generate crypto, start network, create + join channel
#   .\network.ps1 down    – stop and remove all containers / volumes
#   .\network.ps1 restart – down then up
# ==============================================================================
param(
    [ValidateSet("up", "down", "restart")]
    [string]$Mode = "up"
)

$ErrorActionPreference = "Stop"

# ── Paths ─────────────────────────────────────────────────────────────────────
$ScriptDir        = Split-Path -Parent $MyInvocation.MyCommand.Path
$FabricDir        = Split-Path -Parent $ScriptDir
$ConfigDir        = Join-Path $FabricDir "config"
$DockerDir        = Join-Path $FabricDir "docker"
$OrgsDir          = Join-Path $FabricDir "organizations"
$ChannelArtifacts = Join-Path $FabricDir "channel-artifacts"

# ── Settings ──────────────────────────────────────────────────────────────────
$ChannelName     = "healthchainchannel"
$ChannelProfile  = "HealthChainChannel"
$GenesisProfile  = "HealthChainGenesis"
$OrdererAddress  = "orderer.healthchain.com:7050"
$OrdererCA       = "$OrgsDir\ordererOrganizations\orderer.healthchain.com\orderers\orderer.orderer.healthchain.com\msp\tlscacerts\tlsca.orderer.healthchain.com-cert.pem"

$env:FABRIC_CFG_PATH = $ConfigDir

# ── Colour helpers ─────────────────────────────────────────────────────────────
function Info  { param($Msg) Write-Host "[INFO]  $Msg" -ForegroundColor Green  }
function Warn  { param($Msg) Write-Host "[WARN]  $Msg" -ForegroundColor Yellow }
function Fatal { param($Msg) Write-Host "[ERROR] $Msg" -ForegroundColor Red; exit 1 }

# ── Prerequisite check ────────────────────────────────────────────────────────
function Check-Prereqs {
    Info "Checking prerequisites..."
    foreach ($tool in @("docker", "cryptogen", "configtxgen")) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
            Fatal "$tool not found. Install Fabric binaries and ensure Docker Desktop is running."
        }
    }
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Fatal "Docker daemon is not reachable." }
    Info "All prerequisites satisfied."
}

# ── Pull Docker images ────────────────────────────────────────────────────────
function Pull-Images {
    Info "Pulling Hyperledger Fabric Docker images (this may take a while)..."
    $images = @(
        "hyperledger/fabric-tools:2.5",
        "hyperledger/fabric-orderer:2.5",
        "hyperledger/fabric-peer:2.5",
        "hyperledger/fabric-ca:1.5",
        "couchdb:3.3"
    )
    foreach ($img in $images) {
        Info "  pulling $img"
        docker pull $img
        if ($LASTEXITCODE -ne 0) { Fatal "Failed to pull $img" }
    }
    Info "All images pulled."
}

# ── Generate crypto material ───────────────────────────────────────────────────
function Generate-Crypto {
    Info "Generating crypto material with cryptogen..."
    New-Item -ItemType Directory -Force -Path $OrgsDir | Out-Null
    cryptogen generate `
        --config="$ConfigDir\crypto-config.yaml" `
        --output="$OrgsDir"
    if ($LASTEXITCODE -ne 0) { Fatal "cryptogen failed." }
    Info "Crypto material generated → $OrgsDir"
}

# ── Generate channel artifacts ─────────────────────────────────────────────────
function Generate-Artifacts {
    Info "Creating channel artifacts directory..."
    New-Item -ItemType Directory -Force -Path $ChannelArtifacts | Out-Null

    Info "Generating genesis block (profile: $GenesisProfile)..."
    configtxgen `
        -profile $GenesisProfile `
        -channelID system-channel `
        -outputBlock "$ChannelArtifacts\genesis.block"
    if ($LASTEXITCODE -ne 0) { Fatal "configtxgen genesis block failed." }

    Info "Generating channel creation transaction..."
    configtxgen `
        -profile $ChannelProfile `
        -outputCreateChannelTx "$ChannelArtifacts\${ChannelName}.tx" `
        -channelID $ChannelName
    if ($LASTEXITCODE -ne 0) { Fatal "configtxgen channel tx failed." }

    foreach ($org in @("Org1MSP", "Org2MSP", "Org3MSP")) {
        Info "Generating anchor peer update for $org..."
        configtxgen `
            -profile $ChannelProfile `
            -outputAnchorPeersUpdate "$ChannelArtifacts\${org}anchors.tx" `
            -channelID $ChannelName `
            -asOrg $org
        if ($LASTEXITCODE -ne 0) { Fatal "configtxgen anchor update for $org failed." }
    }
    Info "Channel artifacts generated → $ChannelArtifacts"
}

# ── Start network ─────────────────────────────────────────────────────────────
function Start-FabricNetwork {
    Info "Starting HealthChain Fabric network with Docker Compose..."
    docker compose -f "$DockerDir\docker-compose-fabric.yaml" up -d
    if ($LASTEXITCODE -ne 0) { Fatal "docker compose up failed." }
    Info "Waiting 15 seconds for containers to initialise..."
    Start-Sleep -Seconds 15
    Info "Network is up."
}

# ── Set peer environment ───────────────────────────────────────────────────────
function Set-PeerEnv {
    param($MSPId, $OrgDomain, $PeerHost, $PeerPort)
    $env:CORE_PEER_TLS_ENABLED      = "true"
    $env:CORE_PEER_LOCALMSPID       = $MSPId
    $env:CORE_PEER_ADDRESS          = "localhost:$PeerPort"
    $env:CORE_PEER_TLS_ROOTCERT_FILE = "$OrgsDir\peerOrganizations\$OrgDomain\peers\$PeerHost.$OrgDomain\tls\ca.crt"
    $env:CORE_PEER_MSPCONFIGPATH    = "$OrgsDir\peerOrganizations\$OrgDomain\users\Admin@$OrgDomain\msp"
}

# ── Create channel ─────────────────────────────────────────────────────────────
function Create-Channel {
    Info "Creating channel '$ChannelName'..."
    Set-PeerEnv "Org1MSP" "hospitala.healthchain.com" "peer0" 7051
    peer channel create `
        -o $OrdererAddress `
        -c $ChannelName `
        -f "$ChannelArtifacts\${ChannelName}.tx" `
        --outputBlock "$ChannelArtifacts\${ChannelName}.block" `
        --tls --cafile $OrdererCA
    if ($LASTEXITCODE -ne 0) { Fatal "peer channel create failed." }
    Info "Channel '$ChannelName' created."
}

# ── Join all peers ─────────────────────────────────────────────────────────────
function Join-AllPeers {
    $ChannelBlock = "$ChannelArtifacts\${ChannelName}.block"
    $peers = @(
        @{ MSP="Org1MSP"; Domain="hospitala.healthchain.com"; Host="peer0"; Port=7051 },
        @{ MSP="Org1MSP"; Domain="hospitala.healthchain.com"; Host="peer1"; Port=7061 },
        @{ MSP="Org2MSP"; Domain="hospitalb.healthchain.com"; Host="peer0"; Port=8051 },
        @{ MSP="Org2MSP"; Domain="hospitalb.healthchain.com"; Host="peer1"; Port=8061 },
        @{ MSP="Org3MSP"; Domain="diaglab.healthchain.com";   Host="peer0"; Port=9051 },
        @{ MSP="Org3MSP"; Domain="diaglab.healthchain.com";   Host="peer1"; Port=9061 }
    )
    foreach ($p in $peers) {
        Info "Joining $($p.Host).$($p.Domain) to channel..."
        Set-PeerEnv $p.MSP $p.Domain $p.Host $p.Port
        peer channel join -b $ChannelBlock
        if ($LASTEXITCODE -ne 0) { Fatal "Failed to join $($p.Host).$($p.Domain)" }
    }
    Info "All peers joined channel '$ChannelName'."
}

# ── Update anchor peers ────────────────────────────────────────────────────────
function Update-Anchors {
    $anchors = @(
        @{ MSP="Org1MSP"; Domain="hospitala.healthchain.com"; Port=7051 },
        @{ MSP="Org2MSP"; Domain="hospitalb.healthchain.com"; Port=8051 },
        @{ MSP="Org3MSP"; Domain="diaglab.healthchain.com";   Port=9051 }
    )
    foreach ($a in $anchors) {
        Info "Updating anchor peer for $($a.MSP)..."
        Set-PeerEnv $a.MSP $a.Domain "peer0" $a.Port
        peer channel update `
            -o $OrdererAddress `
            -c $ChannelName `
            -f "$ChannelArtifacts\$($a.MSP)anchors.tx" `
            --tls --cafile $OrdererCA
        if ($LASTEXITCODE -ne 0) { Fatal "Anchor update for $($a.MSP) failed." }
    }
    Info "Anchor peers updated."
}

# ── Bring down network ─────────────────────────────────────────────────────────
function Stop-FabricNetwork {
    Info "Stopping HealthChain Fabric network..."
    docker compose -f "$DockerDir\docker-compose-fabric.yaml" down --volumes --remove-orphans
    Info "Removing generated crypto material and channel artifacts..."
    if (Test-Path $OrgsDir)          { Remove-Item -Recurse -Force $OrgsDir }
    if (Test-Path $ChannelArtifacts) { Remove-Item -Recurse -Force $ChannelArtifacts }
    Info "Network stopped and cleaned."
}

# ── Main ───────────────────────────────────────────────────────────────────────
switch ($Mode) {
    "up" {
        Check-Prereqs
        Pull-Images
        Generate-Crypto
        Generate-Artifacts
        Start-FabricNetwork
        Create-Channel
        Join-AllPeers
        Update-Anchors
        Info "✅  HealthChain network is fully operational on channel '$ChannelName'."
    }
    "down" {
        Stop-FabricNetwork
    }
    "restart" {
        Stop-FabricNetwork
        Check-Prereqs
        Pull-Images
        Generate-Crypto
        Generate-Artifacts
        Start-FabricNetwork
        Create-Channel
        Join-AllPeers
        Update-Anchors
        Info "✅  HealthChain network restarted."
    }
}
