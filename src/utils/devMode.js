import { ethers } from 'ethers'
import { DEV_RPC_URL, isPublicDeployment } from './config'

// ============================================
// BlockMed Dev Mode - LOCAL DEVELOPMENT ONLY
// ============================================
// IMPORTANT: This file intentionally contains NO private keys.
// Hardhat owns the development keys and signs transactions through its
// trusted local JSON-RPC endpoint. Never expose that endpoint publicly.

// Public Hardhat development addresses are safe to display in the UI.
// The corresponding private keys remain inside the Hardhat node.
export const DEV_ACCOUNTS = [
  { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', name: 'Admin (Account #0)', role: 'ADMIN' },
  { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', name: 'Doctor (Account #1)', role: 'DOCTOR' },
  { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', name: 'Pharmacist (Account #2)', role: 'PHARMACIST' },
  { address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', name: 'Manufacturer (Account #3)', role: 'MANUFACTURER' },
  { address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', name: 'Patient (Account #4)', role: 'PATIENT' },
  { address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', name: 'Regulator (Account #5)', role: 'REGULATOR' },
]

const DEV_MODE_KEY = 'blockmed-dev-mode'
const DEV_ACCOUNT_KEY = 'blockmed-dev-account'

let devModeEnabled = false
let currentDevAccount = null
let devProvider = null
let devSigner = null

function assertLocalDevelopment() {
  if (isPublicDeployment()) {
    throw new Error('Dev Mode is disabled on public/production deployments.')
  }
}

/** Return accounts exposed by the local Hardhat node without exposing keys. */
export async function getDevAccounts() {
  assertLocalDevelopment()
  const provider = getDevProvider()
  const accounts = await provider.send('eth_accounts', [])

  return accounts.map((address, index) => ({
    address: ethers.getAddress(address),
    name: DEV_ACCOUNTS[index]?.name || `Hardhat Account #${index}`,
    role: DEV_ACCOUNTS[index]?.role || 'UNKNOWN',
  }))
}

/**
 * Restore the local development selection.
 * Only the account index is persisted. No credential is persisted.
 */
export function initDevMode() {
  try {
    if (isPublicDeployment()) {
      disableDevMode()
      return false
    }

    const stored = localStorage.getItem(DEV_MODE_KEY)
    const storedAccount = Number.parseInt(localStorage.getItem(DEV_ACCOUNT_KEY) || '0', 10)

    if (stored !== 'true') return false
    if (!Number.isInteger(storedAccount) || storedAccount < 0 || storedAccount >= DEV_ACCOUNTS.length) {
      disableDevMode()
      return false
    }

    devProvider = new ethers.JsonRpcProvider(DEV_RPC_URL)
    currentDevAccount = DEV_ACCOUNTS[storedAccount]
    devModeEnabled = true
    // JsonRpcSigner delegates signing to the trusted local Hardhat node.
    devSigner = devProvider.getSigner(currentDevAccount.address)

    console.log('🔧 Dev Mode initialized with:', currentDevAccount.name)
    return true
  } catch (error) {
    console.warn('Could not initialize Dev Mode:', error?.message || error)
    disableDevMode()
    return false
  }
}

export function isDevMode() {
  return devModeEnabled
}

/** Enable local Dev Mode using a Hardhat node-managed account. */
export async function enableDevMode(accountIndex = 0) {
  try {
    assertLocalDevelopment()

    if (!Number.isInteger(accountIndex) || accountIndex < 0 || accountIndex >= DEV_ACCOUNTS.length) {
      throw new Error(`Invalid account index. Must be between 0 and ${DEV_ACCOUNTS.length - 1}.`)
    }

    const connected = await testHardhatConnection()
    if (!connected) {
      throw new Error('Hardhat node not running. Start it with: npm run blockchain')
    }

    devProvider = new ethers.JsonRpcProvider(DEV_RPC_URL)
    await devProvider.getBlockNumber()

    // Verify that the expected public development account is actually exposed.
    const accounts = await devProvider.send('eth_accounts', [])
    const selected = accounts.find(
      (address) => address.toLowerCase() === DEV_ACCOUNTS[accountIndex].address.toLowerCase()
    )

    if (!selected) {
      throw new Error(
        'Selected Hardhat account is not exposed by the local node. Restart Hardhat with its standard development accounts.'
      )
    }

    currentDevAccount = {
      ...DEV_ACCOUNTS[accountIndex],
      address: ethers.getAddress(selected),
    }

    // The private key stays inside Hardhat. The browser only receives a JSON-RPC signer.
    devSigner = devProvider.getSigner(currentDevAccount.address)
    await devSigner.getAddress()

    const balance = await devProvider.getBalance(currentDevAccount.address)
    devModeEnabled = true

    try {
      localStorage.setItem(DEV_MODE_KEY, 'true')
      localStorage.setItem(DEV_ACCOUNT_KEY, String(accountIndex))
    } catch (error) {
      console.warn('Could not save Dev Mode settings:', error)
    }

    return {
      success: true,
      account: currentDevAccount,
      balance: ethers.formatEther(balance),
    }
  } catch (error) {
    console.error('❌ Failed to enable Dev Mode:', error?.message || error)
    devModeEnabled = false
    currentDevAccount = null
    devProvider = null
    devSigner = null
    return {
      success: false,
      error: error?.message || 'Failed to enable Dev Mode',
    }
  }
}

export function disableDevMode() {
  devModeEnabled = false
  currentDevAccount = null
  devProvider = null
  devSigner = null

  try {
    localStorage.removeItem(DEV_MODE_KEY)
    localStorage.removeItem(DEV_ACCOUNT_KEY)
  } catch (error) {
    console.warn('Could not clear Dev Mode settings:', error)
  }
}

export async function switchDevAccount(accountIndex) {
  if (!devModeEnabled) throw new Error('Dev Mode is not enabled')
  return enableDevMode(accountIndex)
}

export function getDevAccount() {
  return currentDevAccount
}

export function getDevProvider() {
  assertLocalDevelopment()
  if (!devProvider) {
    devProvider = new ethers.JsonRpcProvider(DEV_RPC_URL)
  }
  return devProvider
}

export function getDevSigner() {
  if (!devModeEnabled || !devSigner) {
    throw new Error('Dev Mode not enabled or no signer available')
  }
  return devSigner
}

export async function getSmartProvider() {
  if (devModeEnabled) return getDevProvider()
  if (window.ethereum) return new ethers.BrowserProvider(window.ethereum)
  throw new Error('No provider available')
}

export async function getSmartSigner() {
  if (devModeEnabled) return getDevSigner()
  if (window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum)
    return provider.getSigner()
  }
  throw new Error('No signer available')
}

export async function testHardhatConnection() {
  if (isPublicDeployment()) return false

  try {
    const response = await fetch(DEV_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    })

    if (!response.ok) return false
    const data = await response.json()
    return typeof data.result === 'string'
  } catch {
    return false
  }
}

export async function getDevBalance() {
  if (!devModeEnabled || !currentDevAccount) return null
  try {
    const balance = await getDevProvider().getBalance(currentDevAccount.address)
    return ethers.formatEther(balance)
  } catch {
    return null
  }
}

export default {
  DEV_ACCOUNTS,
  getDevAccounts,
  initDevMode,
  isDevMode,
  enableDevMode,
  disableDevMode,
  switchDevAccount,
  getDevAccount,
  getDevProvider,
  getDevSigner,
  getSmartProvider,
  getSmartSigner,
  testHardhatConnection,
  getDevBalance,
}
