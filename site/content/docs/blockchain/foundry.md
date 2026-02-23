---
title: Foundry Integration
description: Smart contract development and testing with Foundry for Hybrid agents
---

# Foundry Integration

Learn how to integrate Foundry for smart contract development, testing, and deployment workflows with your Hybrid agents.

## Working with Foundry for Smart Contract Development

Foundry is a fast, portable, and modular toolkit for Ethereum application development. It provides excellent integration with Hybrid agents for contract deployment, testing, and interaction.

### Basic Foundry Setup

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Initialize new Foundry project
forge init my-agent-contracts
cd my-agent-contracts

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std
```

### Project Structure

```
my-agent-contracts/
├── src/
│   ├── AgentRegistry.sol
│   ├── AgentToken.sol
│   └── AgentVault.sol
├── test/
│   ├── AgentRegistry.t.sol
│   ├── AgentToken.t.sol
│   └── AgentVault.t.sol
├── script/
│   ├── Deploy.s.sol
│   └── Interact.s.sol
├── foundry.toml
└── .env
```

### Foundry Configuration

```toml
# foundry.toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
remappings = [
    "@openzeppelin/=lib/openzeppelin-contracts/",
    "@forge-std/=lib/forge-std/src/"
]

# Compiler settings
solc_version = "0.8.19"
optimizer = true
optimizer_runs = 200
via_ir = true

# Testing
verbosity = 2
fuzz_runs = 1000

# RPC endpoints
[rpc_endpoints]
mainnet = "${MAINNET_RPC_URL}"
sepolia = "${SEPOLIA_RPC_URL}"
polygon = "${POLYGON_RPC_URL}"

# Etherscan API keys
[etherscan]
mainnet = { key = "${ETHERSCAN_API_KEY}" }
sepolia = { key = "${ETHERSCAN_API_KEY}" }
polygon = { key = "${POLYGONSCAN_API_KEY}" }
```

## Integration Patterns with Hybrid Agents

### Agent Registry Contract

```solidity
// src/AgentRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract AgentRegistry is Ownable, ReentrancyGuard {
    struct Agent {
        address owner;
        string name;
        string description;
        string xmtpAddress;
        uint256 registrationTime;
        bool active;
        uint256 reputation;
    }
    
    mapping(address => Agent) public agents;
    mapping(string => address) public nameToAgent;
    address[] public agentList;
    
    event AgentRegistered(address indexed agent, string name, string xmtpAddress);
    event AgentUpdated(address indexed agent, string name, string description);
    event AgentDeactivated(address indexed agent);
    event ReputationUpdated(address indexed agent, uint256 newReputation);
    
    uint256 public registrationFee = 0.01 ether;
    
    function registerAgent(
        string memory _name,
        string memory _description,
        string memory _xmtpAddress
    ) external payable nonReentrant {
        require(msg.value >= registrationFee, "Insufficient registration fee");
        require(bytes(_name).length > 0, "Name cannot be empty");
        require(nameToAgent[_name] == address(0), "Name already taken");
        require(agents[msg.sender].registrationTime == 0, "Agent already registered");
        
        agents[msg.sender] = Agent({
            owner: msg.sender,
            name: _name,
            description: _description,
            xmtpAddress: _xmtpAddress,
            registrationTime: block.timestamp,
            active: true,
            reputation: 100 // Starting reputation
        });
        
        nameToAgent[_name] = msg.sender;
        agentList.push(msg.sender);
        
        emit AgentRegistered(msg.sender, _name, _xmtpAddress);
    }
    
    function updateAgent(
        string memory _name,
        string memory _description
    ) external {
        require(agents[msg.sender].registrationTime > 0, "Agent not registered");
        require(agents[msg.sender].active, "Agent not active");
        
        // Update name mapping if name changed
        if (keccak256(bytes(agents[msg.sender].name)) != keccak256(bytes(_name))) {
            require(nameToAgent[_name] == address(0), "Name already taken");
            delete nameToAgent[agents[msg.sender].name];
            nameToAgent[_name] = msg.sender;
        }
        
        agents[msg.sender].name = _name;
        agents[msg.sender].description = _description;
        
        emit AgentUpdated(msg.sender, _name, _description);
    }
    
    function updateReputation(address _agent, uint256 _reputation) external onlyOwner {
        require(agents[_agent].registrationTime > 0, "Agent not registered");
        agents[_agent].reputation = _reputation;
        emit ReputationUpdated(_agent, _reputation);
    }
    
    function deactivateAgent() external {
        require(agents[msg.sender].registrationTime > 0, "Agent not registered");
        require(agents[msg.sender].active, "Agent already inactive");
        
        agents[msg.sender].active = false;
        emit AgentDeactivated(msg.sender);
    }
    
    function getAgent(address _agent) external view returns (Agent memory) {
        return agents[_agent];
    }
    
    function getAgentByName(string memory _name) external view returns (Agent memory) {
        address agentAddress = nameToAgent[_name];
        require(agentAddress != address(0), "Agent not found");
        return agents[agentAddress];
    }
    
    function getActiveAgents() external view returns (address[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < agentList.length; i++) {
            if (agents[agentList[i]].active) {
                activeCount++;
            }
        }
        
        address[] memory activeAgents = new address[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < agentList.length; i++) {
            if (agents[agentList[i]].active) {
                activeAgents[index] = agentList[i];
                index++;
            }
        }
        
        return activeAgents;
    }
}
```

### Agent Vault Contract

```solidity
// src/AgentVault.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract AgentVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    struct Deposit {
        uint256 amount;
        uint256 timestamp;
        bool withdrawn;
    }
    
    mapping(address => mapping(address => Deposit[])) public deposits; // user => token => deposits
    mapping(address => uint256) public agentBalances; // agent => ETH balance
    mapping(address => mapping(address => uint256)) public agentTokenBalances; // agent => token => balance
    
    event DepositMade(address indexed user, address indexed agent, address token, uint256 amount);
    event WithdrawalMade(address indexed user, address indexed agent, address token, uint256 amount);
    event AgentPaid(address indexed agent, address token, uint256 amount);
    
    // Deposit ETH for an agent
    function depositETH(address _agent) external payable nonReentrant {
        require(msg.value > 0, "Must deposit some ETH");
        require(_agent != address(0), "Invalid agent address");
        
        deposits[msg.sender][address(0)].push(Deposit({
            amount: msg.value,
            timestamp: block.timestamp,
            withdrawn: false
        }));
        
        agentBalances[_agent] += msg.value;
        
        emit DepositMade(msg.sender, _agent, address(0), msg.value);
    }
    
    // Deposit ERC20 tokens for an agent
    function depositToken(
        address _agent,
        address _token,
        uint256 _amount
    ) external nonReentrant {
        require(_amount > 0, "Must deposit some tokens");
        require(_agent != address(0), "Invalid agent address");
        require(_token != address(0), "Invalid token address");
        
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        
        deposits[msg.sender][_token].push(Deposit({
            amount: _amount,
            timestamp: block.timestamp,
            withdrawn: false
        }));
        
        agentTokenBalances[_agent][_token] += _amount;
        
        emit DepositMade(msg.sender, _agent, _token, _amount);
    }
    
    // Agent withdraws ETH
    function withdrawETH(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Must withdraw some ETH");
        require(agentBalances[msg.sender] >= _amount, "Insufficient balance");
        
        agentBalances[msg.sender] -= _amount;
        
        (bool success, ) = msg.sender.call{value: _amount}("");
        require(success, "ETH transfer failed");
        
        emit AgentPaid(msg.sender, address(0), _amount);
    }
    
    // Agent withdraws ERC20 tokens
    function withdrawToken(address _token, uint256 _amount) external nonReentrant {
        require(_amount > 0, "Must withdraw some tokens");
        require(agentTokenBalances[msg.sender][_token] >= _amount, "Insufficient balance");
        
        agentTokenBalances[msg.sender][_token] -= _amount;
        IERC20(_token).safeTransfer(msg.sender, _amount);
        
        emit AgentPaid(msg.sender, _token, _amount);
    }
    
    // Get agent's available balance
    function getAgentBalance(address _agent) external view returns (uint256) {
        return agentBalances[_agent];
    }
    
    // Get agent's token balance
    function getAgentTokenBalance(address _agent, address _token) external view returns (uint256) {
        return agentTokenBalances[_agent][_token];
    }
}
```

## Testing and Deployment Workflows

### Comprehensive Test Suite

```solidity
// test/AgentRegistry.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry public registry;
    address public owner;
    address public agent1;
    address public agent2;
    
    function setUp() public {
        owner = address(this);
        agent1 = makeAddr("agent1");
        agent2 = makeAddr("agent2");
        
        registry = new AgentRegistry();
    }
    
    function testRegisterAgent() public {
        vm.deal(agent1, 1 ether);
        vm.prank(agent1);
        
        registry.registerAgent{value: 0.01 ether}(
            "TestAgent",
            "A test agent",
            "0x1234567890abcdef1234567890abcdef12345678"
        );
        
        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.name, "TestAgent");
        assertEq(agent.description, "A test agent");
        assertEq(agent.owner, agent1);
        assertTrue(agent.active);
        assertEq(agent.reputation, 100);
    }
    
    function testCannotRegisterWithInsufficientFee() public {
        vm.deal(agent1, 1 ether);
        vm.prank(agent1);
        
        vm.expectRevert("Insufficient registration fee");
        registry.registerAgent{value: 0.005 ether}(
            "TestAgent",
            "A test agent",
            "0x1234567890abcdef1234567890abcdef12345678"
        );
    }
    
    function testCannotRegisterDuplicateName() public {
        vm.deal(agent1, 1 ether);
        vm.deal(agent2, 1 ether);
        
        vm.prank(agent1);
        registry.registerAgent{value: 0.01 ether}(
            "TestAgent",
            "First agent",
            "0x1234567890abcdef1234567890abcdef12345678"
        );
        
        vm.prank(agent2);
        vm.expectRevert("Name already taken");
        registry.registerAgent{value: 0.01 ether}(
            "TestAgent",
            "Second agent",
            "0x1234567890abcdef1234567890abcdef12345679"
        );
    }
    
    function testUpdateAgent() public {
        vm.deal(agent1, 1 ether);
        vm.prank(agent1);
        
        registry.registerAgent{value: 0.01 ether}(
            "TestAgent",
            "Original description",
            "0x1234567890abcdef1234567890abcdef12345678"
        );
        
        vm.prank(agent1);
        registry.updateAgent("UpdatedAgent", "Updated description");
        
        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.name, "UpdatedAgent");
        assertEq(agent.description, "Updated description");
    }
    
    function testFuzzRegisterAgent(
        string memory name,
        string memory description,
        string memory xmtpAddress
    ) public {
        vm.assume(bytes(name).length > 0 && bytes(name).length < 100);
        vm.assume(bytes(description).length < 1000);
        vm.assume(bytes(xmtpAddress).length > 0);
        
        vm.deal(agent1, 1 ether);
        vm.prank(agent1);
        
        registry.registerAgent{value: 0.01 ether}(name, description, xmtpAddress);
        
        AgentRegistry.Agent memory agent = registry.getAgent(agent1);
        assertEq(agent.name, name);
        assertEq(agent.description, description);
        assertEq(agent.xmtpAddress, xmtpAddress);
    }
}
```

### Deployment Scripts

```solidity
// script/Deploy.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/AgentVault.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry();
        console.log("AgentRegistry deployed at:", address(registry));
        
        // Deploy AgentVault
        AgentVault vault = new AgentVault();
        console.log("AgentVault deployed at:", address(vault));
        
        vm.stopBroadcast();
        
        // Verify contracts on Etherscan
        string memory registryArgs = "";
        string memory vaultArgs = "";
        
        vm.writeFile(
            "./deployment-addresses.json",
            string.concat(
                '{\n',
                '  "AgentRegistry": "', vm.toString(address(registry)), '",\n',
                '  "AgentVault": "', vm.toString(address(vault)), '"\n',
                '}'
            )
        );
    }
}
```

### Interaction Scripts

```solidity
// script/Interact.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/AgentVault.sol";

contract InteractScript is Script {
    AgentRegistry constant REGISTRY = AgentRegistry(0x1234567890123456789012345678901234567890);
    AgentVault constant VAULT = AgentVault(0x1234567890123456789012345678901234567891);
    
    function registerAgent() external {
        uint256 privateKey = vm.envUint("AGENT_PRIVATE_KEY");
        vm.startBroadcast(privateKey);
        
        REGISTRY.registerAgent{value: 0.01 ether}(
            "MyHybridAgent",
            "A sophisticated DeFi trading agent",
            vm.envString("AGENT_XMTP_ADDRESS")
        );
        
        vm.stopBroadcast();
    }
    
    function depositToVault() external {
        uint256 privateKey = vm.envUint("USER_PRIVATE_KEY");
        address agentAddress = vm.envAddress("AGENT_ADDRESS");
        
        vm.startBroadcast(privateKey);
        
        // Deposit 0.1 ETH for the agent
        VAULT.depositETH{value: 0.1 ether}(agentAddress);
        
        vm.stopBroadcast();
    }
    
    function checkAgentStatus() external view {
        address agentAddress = vm.envAddress("AGENT_ADDRESS");
        
        AgentRegistry.Agent memory agent = REGISTRY.getAgent(agentAddress);
        uint256 balance = VAULT.getAgentBalance(agentAddress);
        
        console.log("Agent Name:", agent.name);
        console.log("Agent Active:", agent.active);
        console.log("Agent Reputation:", agent.reputation);
        console.log("Agent Balance:", balance);
    }
}
```

### Integration with Hybrid Agent

```typescript
// Integration with Hybrid agent
import { Agent } from "@hybrd/core"
import { createPublicClient, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { mainnet } from "viem/chains"

// Contract ABIs (generated by Foundry)
import { agentRegistryABI } from "./abis/AgentRegistry"
import { agentVaultABI } from "./abis/AgentVault"

class ContractIntegratedAgent extends Agent {
  private publicClient: any
  private walletClient: any
  private account: any
  
  constructor(config: any) {
    super(config)
    
    this.account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`)
    
    this.publicClient = createPublicClient({
      chain: mainnet,
      transport: http(process.env.ETHEREUM_RPC_URL)
    })
    
    this.walletClient = createWalletClient({
      account: this.account,
      chain: mainnet,
      transport: http(process.env.ETHEREUM_RPC_URL)
    })
    
    this.setupContractTools()
  }
  
  private setupContractTools() {
    // Add contract interaction tools
    this.addTool({
      name: "registerOnChain",
      description: "Register agent on the blockchain registry",
      schema: z.object({
        name: z.string(),
        description: z.string()
      }),
      
      async execute({ name, description }) {
        const { request } = await this.publicClient.simulateContract({
          address: process.env.AGENT_REGISTRY_ADDRESS,
          abi: agentRegistryABI,
          functionName: "registerAgent",
          args: [name, description, this.account.address],
          value: parseEther("0.01"),
          account: this.account
        })
        
        const hash = await this.walletClient.writeContract(request)
        
        return {
          transactionHash: hash,
          message: `Agent registered on-chain with name: ${name}`
        }
      }
    })
    
    this.addTool({
      name: "checkBalance",
      description: "Check agent's balance in the vault",
      schema: z.object({}),
      
      async execute() {
        const balance = await this.publicClient.readContract({
          address: process.env.AGENT_VAULT_ADDRESS,
          abi: agentVaultABI,
          functionName: "getAgentBalance",
          args: [this.account.address]
        })
        
        return {
          balance: formatEther(balance),
          balanceWei: balance.toString(),
          message: `Current vault balance: ${formatEther(balance)} ETH`
        }
      }
    })
    
    this.addTool({
      name: "withdrawFromVault",
      description: "Withdraw ETH from the agent vault",
      schema: z.object({
        amount: z.string().describe("Amount in ETH to withdraw")
      }),
      
      async execute({ amount }) {
        const amountWei = parseEther(amount)
        
        const { request } = await this.publicClient.simulateContract({
          address: process.env.AGENT_VAULT_ADDRESS,
          abi: agentVaultABI,
          functionName: "withdrawETH",
          args: [amountWei],
          account: this.account
        })
        
        const hash = await this.walletClient.writeContract(request)
        
        return {
          transactionHash: hash,
          amount,
          message: `Withdrew ${amount} ETH from vault`
        }
      }
    })
  }
  
  async onMessage(message: any) {
    // Handle on-chain registration requests
    if (message.content.includes("register on chain")) {
      await this.call("registerOnChain", {
        name: "AutoRegisteredAgent",
        description: "Agent registered via XMTP message"
      })
      
      await this.call("sendMessage", {
        to: message.sender,
        content: "✅ Successfully registered on the blockchain registry!"
      })
    }
    
    // Handle balance checks
    if (message.content.includes("check balance")) {
      const result = await this.call("checkBalance", {})
      
      await this.call("sendMessage", {
        to: message.sender,
        content: `💰 ${result.message}`
      })
    }
    
    return super.onMessage(message)
  }
}
```

### Continuous Integration with Foundry

```yaml
# .github/workflows/foundry.yml
name: Foundry CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  FOUNDRY_PROFILE: ci

jobs:
  check:
    strategy:
      fail-fast: true

    name: Foundry project
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1
        with:
          version: nightly

      - name: Run Forge build
        run: |
          forge --version
          forge build --sizes
        id: build

      - name: Run Forge tests
        run: |
          forge test -vvv
        id: test

      - name: Run Forge coverage
        run: |
          forge coverage --report lcov
        id: coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./lcov.info
          flags: foundry

      - name: Run Forge gas snapshot
        run: |
          forge snapshot --check
        id: snapshot
```

### Advanced Testing Patterns

```solidity
// test/integration/AgentWorkflow.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/AgentRegistry.sol";
import "../../src/AgentVault.sol";

contract AgentWorkflowTest is Test {
    AgentRegistry public registry;
    AgentVault public vault;
    
    address public agent;
    address public user;
    
    function setUp() public {
        registry = new AgentRegistry();
        vault = new AgentVault();
        
        agent = makeAddr("agent");
        user = makeAddr("user");
        
        vm.deal(agent, 10 ether);
        vm.deal(user, 10 ether);
    }
    
    function testCompleteAgentWorkflow() public {
        // 1. Agent registers
        vm.prank(agent);
        registry.registerAgent{value: 0.01 ether}(
            "WorkflowAgent",
            "Testing complete workflow",
            "0x1234567890abcdef1234567890abcdef12345678"
        );
        
        // 2. User deposits funds for agent
        vm.prank(user);
        vault.depositETH{value: 1 ether}(agent);
        
        // 3. Verify agent can see the deposit
        uint256 balance = vault.getAgentBalance(agent);
        assertEq(balance, 1 ether);
        
        // 4. Agent withdraws some funds
        vm.prank(agent);
        vault.withdrawETH(0.5 ether);
        
        // 5. Verify remaining balance
        balance = vault.getAgentBalance(agent);
        assertEq(balance, 0.5 ether);
        
        // 6. Verify agent's ETH balance increased
        assertEq(agent.balance, 9.5 ether + 0.5 ether); // Initial + withdrawn
    }
    
    function testAgentReputationSystem() public {
        // Register agent
        vm.prank(agent);
        registry.registerAgent{value: 0.01 ether}(
            "ReputationAgent",
            "Testing reputation",
            "0x1234567890abcdef1234567890abcdef12345678"
        );
        
        // Check initial reputation
        AgentRegistry.Agent memory agentData = registry.getAgent(agent);
        assertEq(agentData.reputation, 100);
        
        // Owner updates reputation
        registry.updateReputation(agent, 150);
        
        // Verify reputation update
        agentData = registry.getAgent(agent);
        assertEq(agentData.reputation, 150);
    }
}
```

## Next Steps

- Learn about [Multi-chain Support](/blockchain/multi-chain) for cross-chain operations
- Explore [XMTP Tools](/tools/xmtp) for messaging capabilities
- Check out [Tools](/tools) for creating custom agent capabilities
- See [Developing](/developing/contributing) for advanced development
