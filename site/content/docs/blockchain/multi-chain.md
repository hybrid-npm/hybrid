---
title: Multi-chain Support
description: Cross-chain operations, transaction handling, and gas management strategies
---

# Multi-chain Support

Learn how to build agents that operate seamlessly across multiple blockchain networks with optimized gas management and cross-chain strategies.

## Chain Configuration and Switching

Hybrid supports multiple blockchain networks out of the box, allowing your agents to operate across different chains based on user needs and cost optimization.

### Supported Networks

```typescript
// Available networks in Hybrid
const supportedChains = {
  // Mainnet
  ethereum: {
    chainId: 1,
    name: "Ethereum Mainnet",
    nativeCurrency: "ETH",
    rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/your-api-key",
    blockExplorer: "https://etherscan.io",
    gasMultiplier: 1.1,
    features: ["full-defi", "highest-liquidity", "most-secure"]
  },
  
  // Layer 2 Networks
  polygon: {
    chainId: 137,
    name: "Polygon",
    nativeCurrency: "MATIC",
    rpcUrl: "https://polygon-mainnet.g.alchemy.com/v2/your-api-key",
    blockExplorer: "https://polygonscan.com",
    gasMultiplier: 1.2,
    features: ["low-cost", "fast-transactions", "ethereum-compatible"]
  },
  
  arbitrum: {
    chainId: 42161,
    name: "Arbitrum One",
    nativeCurrency: "ETH",
    rpcUrl: "https://arb-mainnet.g.alchemy.com/v2/your-api-key",
    blockExplorer: "https://arbiscan.io",
    gasMultiplier: 1.1,
    features: ["ethereum-l2", "optimistic-rollup", "low-cost"]
  },
  
  optimism: {
    chainId: 10,
    name: "Optimism",
    nativeCurrency: "ETH",
    rpcUrl: "https://opt-mainnet.g.alchemy.com/v2/your-api-key",
    blockExplorer: "https://optimistic.etherscan.io",
    gasMultiplier: 1.1,
    features: ["ethereum-l2", "optimistic-rollup", "fast-finality"]
  },
  
  base: {
    chainId: 8453,
    name: "Base",
    nativeCurrency: "ETH",
    rpcUrl: "https://base-mainnet.g.alchemy.com/v2/your-api-key",
    blockExplorer: "https://basescan.org",
    gasMultiplier: 1.1,
    features: ["coinbase-l2", "growing-ecosystem", "low-cost"]
  },
  
  // Testnets
  sepolia: {
    chainId: 11155111,
    name: "Sepolia Testnet",
    nativeCurrency: "ETH",
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/your-api-key",
    blockExplorer: "https://sepolia.etherscan.io",
    gasMultiplier: 1.0,
    features: ["testnet", "free-eth", "development"]
  }
}
```

### Dynamic Chain Selection

```typescript
// Intelligent chain selection based on context
class ChainSelector {
  static selectOptimalChain(context: {
    operation: string
    amount: number
    urgency: "low" | "medium" | "high"
    userPreference?: string
    gasThreshold?: number
  }) {
    const { operation, amount, urgency, userPreference, gasThreshold } = context
    
    // User preference takes priority
    if (userPreference && supportedChains[userPreference]) {
      return userPreference
    }
    
    // For small amounts, prefer L2s
    if (amount < 0.01) {
      return this.selectL2Chain(urgency)
    }
    
    // For large amounts, consider security vs cost
    if (amount > 10) {
      return urgency === "high" ? "ethereum" : this.selectL2Chain("medium")
    }
    
    // For DeFi operations, consider liquidity
    if (operation.includes("swap") || operation.includes("trade")) {
      return this.selectDeFiChain(amount)
    }
    
    // Default to cost-effective option
    return this.selectL2Chain(urgency)
  }
  
  private static selectL2Chain(urgency: string) {
    switch (urgency) {
      case "high":
        return "arbitrum" // Fast finality
      case "medium":
        return "polygon" // Good balance
      case "low":
        return "base" // Lowest cost
      default:
        return "polygon"
    }
  }
  
  private static selectDeFiChain(amount: number) {
    if (amount > 1) {
      return "ethereum" // Highest liquidity
    } else if (amount > 0.1) {
      return "arbitrum" // Good DeFi ecosystem
    } else {
      return "polygon" // Cost effective
    }
  }
}

// Usage in agent
const agent = new Agent({
  tools: [
    blockchainTools({
      chainSelector: ChainSelector.selectOptimalChain,
      defaultChain: "polygon"
    })
  ]
})
```

## Transaction Handling Across Chains

### Universal Transaction Interface

```typescript
// Unified transaction interface across chains
interface UniversalTransaction {
  to: string
  amount: string
  chain?: string
  token?: string
  gasSettings?: {
    maxGasPrice?: string
    gasLimit?: number
    priority?: "low" | "medium" | "high"
  }
  metadata?: {
    description?: string
    category?: string
    urgency?: string
  }
}

class UniversalTransactionHandler {
  async executeTransaction(tx: UniversalTransaction): Promise<any> {
    // Select optimal chain if not specified
    if (!tx.chain) {
      tx.chain = this.selectOptimalChain(tx)
    }
    
    // Validate transaction for target chain
    await this.validateTransaction(tx)
    
    // Optimize gas settings for chain
    const optimizedTx = await this.optimizeGasSettings(tx)
    
    // Execute transaction
    const result = await this.executeOnChain(optimizedTx)
    
    // Monitor and track
    await this.trackTransaction(result, optimizedTx)
    
    return result
  }
  
  private selectOptimalChain(tx: UniversalTransaction): string {
    const amount = parseFloat(tx.amount)
    const urgency = tx.metadata?.urgency || "medium"
    
    return ChainSelector.selectOptimalChain({
      operation: "transfer",
      amount,
      urgency: urgency as any
    })
  }
  
  private async validateTransaction(tx: UniversalTransaction): Promise<void> {
    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(tx.to)) {
      throw new Error("Invalid recipient address")
    }
    
    // Validate amount
    if (parseFloat(tx.amount) <= 0) {
      throw new Error("Amount must be positive")
    }
    
    // Check chain-specific requirements
    await this.validateChainRequirements(tx)
  }
  
  private async optimizeGasSettings(tx: UniversalTransaction): Promise<UniversalTransaction> {
    const chainConfig = supportedChains[tx.chain!]
    
    // Get current gas prices for chain
    const gasPrices = await agent.call("getGasPrice", { chain: tx.chain })
    
    // Select appropriate gas price based on priority
    const priority = tx.gasSettings?.priority || "medium"
    let gasPrice: string
    
    switch (priority) {
      case "low":
        gasPrice = gasPrices.slow || gasPrices.standard
        break
      case "high":
        gasPrice = gasPrices.fast || gasPrices.instant
        break
      default:
        gasPrice = gasPrices.standard
    }
    
    // Apply chain-specific gas multiplier
    const adjustedGasPrice = (BigInt(gasPrice) * BigInt(Math.floor(chainConfig.gasMultiplier * 100))) / BigInt(100)
    
    return {
      ...tx,
      gasSettings: {
        ...tx.gasSettings,
        maxGasPrice: adjustedGasPrice.toString(),
        gasLimit: tx.gasSettings?.gasLimit || 21000
      }
    }
  }
}
```

## Gas Management Strategies

### Intelligent Gas Optimization

```typescript
// Advanced gas management across chains
class GasManager {
  private gasHistory = new Map<string, Array<{
    timestamp: number
    gasPrice: string
    chain: string
  }>>()
  
  async getOptimalGasSettings(chain: string, urgency: string = "medium") {
    // Get current gas prices
    const currentGas = await agent.call("getGasPrice", { chain })
    
    // Analyze historical patterns
    const historicalData = this.getHistoricalGasData(chain)
    const prediction = this.predictGasTrends(historicalData)
    
    // Calculate optimal settings
    return this.calculateOptimalGas(currentGas, prediction, urgency)
  }
  
  private getHistoricalGasData(chain: string) {
    const history = this.gasHistory.get(chain) || []
    const last24Hours = Date.now() - (24 * 60 * 60 * 1000)
    
    return history.filter(entry => entry.timestamp > last24Hours)
  }
  
  private predictGasTrends(historicalData: any[]) {
    if (historicalData.length < 10) {
      return { trend: "stable", confidence: 0.5 }
    }
    
    // Simple trend analysis
    const recent = historicalData.slice(-10)
    const older = historicalData.slice(-20, -10)
    
    const recentAvg = recent.reduce((sum, entry) => 
      sum + parseInt(entry.gasPrice), 0) / recent.length
    const olderAvg = older.reduce((sum, entry) => 
      sum + parseInt(entry.gasPrice), 0) / older.length
    
    const change = (recentAvg - olderAvg) / olderAvg
    
    if (change > 0.1) {
      return { trend: "increasing", confidence: 0.8 }
    } else if (change < -0.1) {
      return { trend: "decreasing", confidence: 0.8 }
    } else {
      return { trend: "stable", confidence: 0.9 }
    }
  }
  
  private calculateOptimalGas(currentGas: any, prediction: any, urgency: string) {
    let baseGasPrice: string
    
    // Select base gas price
    switch (urgency) {
      case "low":
        baseGasPrice = currentGas.slow || currentGas.standard
        break
      case "high":
        baseGasPrice = currentGas.fast || currentGas.instant
        break
      default:
        baseGasPrice = currentGas.standard
    }
    
    // Adjust based on prediction
    let multiplier = 1.0
    
    if (prediction.trend === "increasing" && prediction.confidence > 0.7) {
      multiplier = urgency === "low" ? 1.1 : 1.2
    } else if (prediction.trend === "decreasing" && prediction.confidence > 0.7) {
      multiplier = urgency === "high" ? 0.95 : 0.9
    }
    
    const optimizedGasPrice = Math.floor(parseInt(baseGasPrice) * multiplier)
    
    return {
      gasPrice: optimizedGasPrice.toString(),
      estimatedConfirmationTime: this.estimateConfirmationTime(optimizedGasPrice, urgency),
      confidence: prediction.confidence,
      reasoning: this.generateGasReasoning(prediction, multiplier, urgency)
    }
  }
}
```

## Next Steps

- Learn about [Developing and Contribution](/developing/contributing) for advanced development
- Explore [XMTP Tools](/tools/xmtp) for messaging capabilities
- Check out [Tools](/tools) for creating custom agent capabilities
- See [Agent Configuration](/agent/behaviors) for message processing
