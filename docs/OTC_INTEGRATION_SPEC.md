# OTC integration specification

Verified against the official OTC website and launcher on 2026-09-13.

## Official sources

- Product: https://otcdesks.cash/
- Documentation: https://otcdesks.cash/docs
- Launcher: https://otcdesks.cash/launcher
- Official X account: https://x.com/otc_labs

## Supported launch surface

- Launch venues: Pump and Meteora.
- Curated pairs: 93 total.
  - xStocks: 35
  - Backpack: 35
  - Crypto: 23
- The exact current curated catalog, logo URLs, and mint addresses are stored in
  `data/pairs.json` and are the backend validation source of truth.
- OTC also documents custom reward mints, but only when its automated audit
  confirms that transfers work, no transfer fee exists, no transfer hook exists,
  and a real market exists. The X listener intentionally accepts only the curated
  catalog until OTC exposes that audit as a supported integration.

## Launch semantics

- A Pump launch is an ordinary pump.fun coin whose creator fees are assigned to
  OTC's reward wallet at creation time. The assignment is irrevocable.
- For a custom-paired launch, fees arrive in the pair asset. OTC documents that
  67.5% is distributed to holders in that asset.
- Current documented creator-fee split:
  - Holders: 67.5%
  - Desk pot: 10%
  - OTC buyback and burn: 10%
  - OTC holders: 5%
  - Protocol: 5%
  - Token-account rent: 2.5%
- The launcher asks for image, name, ticker, description, X URL, first-buy amount,
  venue, and pair.

## Integration boundary

The public documentation and launcher do not document a public server-to-server
launch API. Test mode therefore exercises the complete detection, validation,
database, retry, feed, and single-reply flow without signing or broadcasting a
transaction. Live mode stays fail-closed until OTC provides a supported endpoint
and token, or a dedicated wallet/browser signing session is explicitly approved.

## On-chain references

- Program: `AjMx5My4YUDHMiCtLpTAtgkiUJgrpJnQqd5AcQnddHQW`
- Pot: `BZcvtxDy4WihU24k3pezzajuiqYtTUHPfH7b5m26BucR`
- Config: `9b5VLbpXedgXcjWyboXqHMbDgeHJtb5PBsy6TE18REU4`
- Metaplex Core: `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d`

