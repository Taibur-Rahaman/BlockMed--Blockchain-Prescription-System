# 🚀 BlockMed Wallet & Authentication Setup

## Authentication model

BlockMed uses **Ethereum wallet identity + smart-contract RBAC**, not username/password authentication or JWT sessions.

- The wallet address is the user's blockchain identity.
- `BlockMedV2.sol` stores the user's role, verification state, and active state.
- Protected contract functions enforce authorization with Solidity modifiers.
- MetaMask/Frame keeps production private keys inside the wallet and signs transactions.
- Dev Mode is a **local-development-only** convenience for a Hardhat node.

> **Security rule:** the frontend must never contain or persist a real private key.

---

## Option 1: Dev Mode (local development)

Dev Mode requires a local Hardhat node and does not require MetaMask.

### 1. Start Hardhat

```bash
npm run blockchain
# or
npx hardhat node
```

### 2. Deploy the contract

In another terminal:

```bash
npm run deploy:check
```

### 3. Start the app

```bash
npm run dev
```

### 4. Enable Dev Mode

On the login page, select **"🔧 Use Dev Mode"** and choose a Hardhat account.

The frontend now receives only the account address through `eth_accounts`. The private key remains inside the Hardhat node. Writes use an `ethers.JsonRpcSigner`, which asks the trusted local node to sign the transaction.

### Dev Mode storage

The browser stores only:

```text
blockmed-dev-mode = true
blockmed-dev-account = <account index>
```

No private key is stored in localStorage.

### Dev accounts

| Account | Address | Role |
|---------|---------|------|
| #0 | `0xf39Fd6...92266` | Admin |
| #1 | `0x709979...dc79C8` | Doctor |
| #2 | `0x3C44Cd...4293BC` | Pharmacist |
| #3 | `0x90F79b...93b906` | Manufacturer |
| #4 | `0x15d34A...2C6A65` | Patient |
| #5 | `0x996550...0A4dc` | Regulator |

These are standard Hardhat development accounts. Their private keys are intentionally **not present in the frontend source code**.

### Important Dev Mode security requirement

Keep Hardhat bound to a trusted local interface. Do **not** expose `http://127.0.0.1:8545` or another Hardhat RPC endpoint to the public internet. Anyone who can control an unlocked development account can sign transactions with it.

---

## Option 2: MetaMask / Frame Wallet

This is the intended wallet-based authentication path for public deployments.

### 1. Connect the wallet

Click **Connect Wallet** in BlockMed. The application requests the wallet's account address with `eth_requestAccounts`.

### 2. Select the correct network

The application switches to the configured network. For public deployments this is controlled by `VITE_PUBLIC_NETWORK` and defaults to Sepolia.

### 3. User identity is loaded from the contract

After obtaining the address, BlockMed calls:

```js
contract.getUser(account)
```

The returned `User` record supplies the role, name, license number, verification state, and active state.

### 4. Transactions are signed by the wallet

For writes:

```text
Browser
  ↓
MetaMask / Frame
  ↓
Signed Ethereum transaction
  ↓
BlockMedV2.sol
  ↓
msg.sender
  ↓
RBAC modifier
```

The application never needs the wallet's private key.

---

## Registration and verification

A new user registers the address currently connected to the wallet:

```solidity
registerUser(name, licenseNumber, role)
```

The contract records:

```solidity
userAddress: msg.sender
isVerified: false
isActive: true
```

An administrator must then verify the account:

```solidity
verifyUser(userAddress)
```

Protected actions require the appropriate role and, where applicable, verification and active status.

---

## Role authorization

`BlockMedV2.sol` defines:

```text
Admin
Doctor
Pharmacist
Manufacturer
Patient
Regulator
```

Examples include:

```solidity
modifier onlyDoctor() {
    require(
        users[msg.sender].role == Role.Doctor &&
        users[msg.sender].isVerified,
        "Only verified doctor can perform this action"
    );
    _;
}
```

and:

```solidity
modifier onlyPharmacistOrAdmin() {
    require(
        (users[msg.sender].role == Role.Pharmacist && users[msg.sender].isVerified) ||
        (users[msg.sender].role == Role.Admin && users[msg.sender].isVerified) ||
        msg.sender == owner,
        "Only verified pharmacist or admin can perform this action"
    );
    _;
}
```

Frontend role checks are for user experience only. The smart contract is the final authorization boundary.

---

## No JWT authentication

BlockMed does not use a traditional JWT bearer-token flow such as:

```http
Authorization: Bearer <token>
```

The authentication model is instead:

```text
Wallet controls private key
        ↓
Wallet controls Ethereum address
        ↓
Contract maps address → User
        ↓
Contract checks role/verification/activity
        ↓
Transaction succeeds or reverts
```

Client-side `sessionId` and localStorage flags are not security credentials and must never be treated as proof of authorization.

---

## Production checklist

Before deploying publicly:

- [ ] Never commit private keys, seed phrases, or API secrets.
- [ ] Never use Hardhat development keys for real funds.
- [ ] Keep Dev Mode disabled on public deployments.
- [ ] Use MetaMask/Frame or another secure wallet for signing.
- [ ] Verify the configured chain ID before sending transactions.
- [ ] Keep authorization checks in the Solidity contract.
- [ ] Do not put patient PII directly on-chain.
- [ ] Use salted hashes/IPFS references as designed by the contract where appropriate.
- [ ] Review contract ownership and admin controls before production deployment.

---

## Troubleshooting

### ❌ "Hardhat Not Running"

Run:

```bash
npm run blockchain
```

### ❌ Dev Mode cannot find an account

Restart the standard Hardhat node and make sure the expected development accounts are exposed.

### ❌ Insufficient funds

Restarting a local Hardhat node normally resets its development balances.

### ❌ MetaMask cannot connect

Confirm that the wallet is installed and that the application is using the configured network. For local development, Dev Mode can be used instead.

### ❌ Transaction rejected

The wallet user rejected the signature, or the smart contract rejected the transaction because the connected address does not satisfy the required role/verification/activity checks.

---

## Quick commands

```bash
npm run blockchain
npm run deploy:check
npm run deploy
npm run test:blockchain
npm run test:all
npm run dev
npm run start
```
