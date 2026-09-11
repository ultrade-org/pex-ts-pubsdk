# Public API Contract

The PDex TypeScript SDK supports external applications that read protocol data,
calculate quotes, inspect state, and prepare wallet-signed PDex V2 transactions.

## Package modules

| Module | Capability |
| --- | --- |
| `@pdex/sdk` | Convenient root exports for the complete integration surface. |
| `@pdex/sdk/api` | Backend data, account sessions, quotes, oracle payloads, performance, and pagination. |
| `@pdex/sdk/manifest` | Protocol and deployment manifest loading and app/asset resolution. |
| `@pdex/sdk/constants` | Protocol units, flags, fees, storage amounts, and action enums. |
| `@pdex/sdk/oracle` | Price12 conversion, signed-payload decoding, validation, and signature verification. |
| `@pdex/sdk/boxes` | Box keys and typed V2 state parsers. |
| `@pdex/sdk/receipts` | ABI receipt encoding and decoding. |
| `@pdex/sdk/readModels` | Typed public state records and camel-case, bigint-safe normalization. |
| `@pdex/sdk/integration` | Browser bootstrap, app/asset references, account authorization, and wallet submission. |
| `@pdex/sdk/testFunds` | Wallet-safe ASA opt-in and test-network ALGO return transactions. |
| `@pdex/sdk/v2Risk` | Margin, leverage, utilization, and risk calculations. |
| `@pdex/sdk/v2Quotes` | Position, liquidity, swap, CVA, liquidation, and NAV quotes. |
| `@pdex/sdk/v2OrderQuotes` | Open and decrease order quotes and execution previews. |
| `@pdex/sdk/v2PositionResolution` | Position-cost reads, simulations, and action resolution. |
| `@pdex/sdk/orders` | Order lifecycle analysis and related-order cleanup planning. |
| `@pdex/sdk/planners` | Structured action planning and resource manifests. |
| `@pdex/sdk/marketYield` | Yield-state normalization, valuation, withdrawal quotes, and resource closure. |
| `@pdex/sdk/externalYield` | External yield-provider state and resource helpers. |
| `@pdex/sdk/transactions` | App-call descriptors and wallet-ready Algorand transaction groups. |

## Capability guarantees

The supported integration surface includes:

- protocol bootstrap and deployment discovery;
- market, pool, price, candle, performance, and yield reads;
- wallet-authenticated positions, orders, LP, trade, activity, margin, and CVA
  reads;
- deterministic local and backend quotes;
- typed OracleMessageV3 transport, decoding, and verification;
- pair and single-token liquidity, trading, margin, order, liquidation, swap,
  and CVA wallet groups;
- linked and active attached-order groups;
- capped, user-authorized builder fees for supported pair and swap actions;
- box and receipt decoding for independent state verification;
- normalized market, pool, position, order, LP, margin, and activity models;
- one-call public context loading and sign/submit/confirm orchestration.

## Compatibility

The package follows semantic versioning. Public exports, input types, response
types, integer units, and transaction-group semantics are compatibility
contracts. A change to required group order, resources, fee shape, oracle
payloads, box layouts, or receipt layouts requires coordinated versioning and
conformance evidence.

Applications should resolve runtime IDs and market capabilities from the
current backend manifests instead of hard-coding a deployment generation.

## Payout preparation in 0.3.0

`prepareV2ActionRecall` provides strict, current recall planning for all payout
families. `prepareV2DecreaseOrCloseInput` and
`prepareV2DecreaseOrCloseTransactions` prepare pair-close recall automatically.
Payout builders reject omitted recall mode; integrations must migrate before
using this version. See INTEGRATION_GUIDE.md for mode and cap mapping.
