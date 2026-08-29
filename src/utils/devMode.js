import { ethers } from 'ethers'
import { DEV_RPC_URL, isPublicDeployment } from './config'

// ============================================
// BlockMed Dev Mode - LOCAL DEVELOPMENT ONLY
// ============================================
// Dev Mode connects to a trusted local Hardhat node. It deliberately
// does NOT contain or persist private keys in the frontend bundle.
// Hardhat exposes its local accounts through eth_accounts and signs
// transactions for those unlocked development accounts.
//
// IMPORTANT: Never expose a Hardhat RPC endpoint to an untrusted network.
// Never use Hardhat development accounts on a production/public chain.

const DEV_MODE_KEY = 'blockmed-dev-mode'
const DEV_ACCOUNT_KEY = 'blockmed-dev-account'

const ACCOUNT_ROLES = [
  'ADMIN',
  'DOCTOR',
  'PHARMACIST',
  'MANUFACTURER',
  'PATIENT',
  'REGULATOR',
]

const ACCOUNT_NAMES = [
  'Admin (Account #0)',
  'Doctor (Account #1)',
  'Pharmacist (Account #2)',
  'Manufacturer (Account #3)',
  'Patient (Account #4)',
  'Regulator (Account #5)',
]

let devModeEnabled = false
let currentDevAccount = null
let devProvider = null
let devSigner = null

function assertLocalDevelopment() {
  if (isPublicDeployment()) {
    throw new Error('Dev Mode is disabled on public/production deployments.')
  }
}

/**
 * Get accounts exposed by the local Hardhat JSON-RPC node.
 * The node owns the private keys; the browser never receives them.
 */
async function getHardhatAccounts(provider) {
  const accounts = await provider.send('eth_accounts', [])
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('No Hardhat accounts available. Start: npm run blockchain')
  }
  return accounts
}

/**
 * Build the account list shown by the Dev Mode selector.
 * Only public addresses are returned; no private key is exposed.
 */
export async function getDevAccounts() {
  assertLocalDevelopment()
  const provider = getDevProvider()
  const accounts = await getHardhatAccounts(provider)

  return accounts.map((address, index) => ({
    address,
    name: ACCOUNT_NAMES[index] || `Hardhat Account #${index}`,
    role: ACCOUNT_ROLES[index] || 'UNKNOWN',
  }))
}

/**
 * Initialize Dev Mode from localStorage.
 * localStorage stores only the selected account index, never credentials.
 */
export async function initDevMode() {
  try {
    if (isPublicDeployment()) {
      disableDevMode()
      return false
    }

    const stored = localStorage.getItem(DEV_MODE_KEY)
    const storedAccount = localStorage.getItem(DEV_ACCOUNT_KEY)

    if (stored === 'true') {
      const accountIndex = Number.parseInt(storedAccount, 10)
      if (!Number.isInteger(accountIndex) || accountIndex < 0) {
        disableDevMode()
        return false
      }

      devModeEnabled = true
      const accounts = await getDevAccounts()
      currentDevAccount = accounts[accountIndex] || accounts[0]

      if (!currentDevAccount) {
        disableDevMode()
        return false
      }

      // Recreate a node-managed signer. No private key is loaded by the app.
      devSigner = getDevProvider().getSigner(currentDevAccount.address)
      console.log('🔧 Dev Mode initialized with:', currentDevAccount.name)
      return true
    }
  } catch (e) {
    console.warn('Could not initialize Dev Mode:', e?.message || e)
    disableDevMode()
  }
  return false
}

export function isDevMode() {
  return devModeEnabled
}

/**
 * Enable local Dev Mode with a Hardhat account.
 */
export async function enableDevMode(accountIndex = 0) {
  try {
    assertLocalDevelopment()

    if (!Number.isInteger(accountIndex) || accountIndex < 0) {
      throw new Error('Invalid Hardhat account index')
    }

    const connected = await testHardhatConnection()
    if (!connected) {
      throw new Error('Hardhat node not running. Start it with: npm run blockchain')
    }

    devProvider = new ethers.JsonRpcProvider(DEV_RPC_URL)
    await devProvider.getBlockNumber()

    const accounts = await getHardhatAccounts(devProvider)
    if (accountIndex >= accounts.length) {
      throw new Error(`Invalid account index. Hardhat exposed ${accounts.length} accounts.`)
    }

    const address = ethers.getAddress(accounts[accountIndex])
    currentDevAccount = {
      address,
      name: ACCOUNT_NAMES[accountIndex] || `Hardhat Account #${accountIndex}`,
      role: ACCOUNT_ROLES[accountIndex] || 'UNKNOWN',
    }

    // JsonRpcSigner asks the trusted local Hardhat node to sign/send.
    // The private key remains inside Hardhat and is never bundled in JS.
    devSigner = devProvider.getSigner(address)
    await devSigner.getAddress()

    const balance = await devProvider.getBalance(address)
    const balanceEth = parseFloat(ethers.formatEther(balance))
    if (balanceEth < 0.01) {
      console.warn('⚠️ Account has very low balance:', balanceEth, 'ETH')
    }

    devModeEnabled = true

    try {
      localStorage.setItem(DEV_MODE_KEY, 'true')
      localStorage.setItem(DEV_ACCOUNT_KEY, String(accountIndex))
    } catch (e) {
      console.warn('Could not save Dev Mode settings:', e)
    }

    console.log('✅ Dev Mode enabled')
    console.log('📍 Account:', currentDevAccount.name)
    console.log('💰 Address:', currentDevAccount.address)
    console.log('💎 Balance:', ethers.formatEther(balance), 'ETH')

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
  } catch (e) {
    console.warn('Could not clear Dev Mode settings:', e)
  }

  console.log('🔒 Dev Mode disabled')
}

export async function switchDevAccount(accountIndex) {
  if (!devModeEnabled) {
    throw new Error('Dev Mode is not enabled')
  }
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
  if (devModeEnabled) {
    return getDevProvider()
  }

  if (window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum)
  }

  throw new Error('No provider available')
}

export async function getSmartSigner() {
  if (devModeEnabled) {
    return getDevSigner()
  }

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
    const provider = getDevProvider()
    const balance = await provider.getBalance(currentDevAccount.address)
    return ethers.formatEther(balance)
  } catch {
    return null
  }
}

export default {
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
