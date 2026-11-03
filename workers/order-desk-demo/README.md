# order-desk-demo

A Notion **custom block** that shows what custom blocks can do for *UI*, not
just visualisation: pickers that narrow on another field's value, and an order
flow whose stages are gated. It's a generic rebuild of the Knoxx order desk
(`knoxx-notion-workers/workers/order-desk`) over fictional data, made to be
shown to people outside workFlowers.

The business is **Cauldron & Co**, a potion-ingredient wholesaler. Every name,
price and address is invented.

## What to show

| Try this | What it demonstrates |
| --- | --- |
| New order → pick a customer | The site picker only offers that customer's sites, and picks the only one automatically. |
| Add a line | The ingredient picker only offers what's on that customer's price list, with their agreed price. |
| Tick "Show the full catalogue" | Everything else, greyed, each with the reason it can't be ordered. |
| Pick an ingredient | Price fills in from the price list and links the entry it came from (tagged *price list*); typing a price tags it *manual*. |
| Open **CC-1002** (The Gilded Newt) | Four blockers at once: restricted stock for an unlicensed customer, volatile stock to an unwarded site, an unpriced line. |
| Open **CC-1003** (Ravenmoor) | A cursed ingredient to an unwarded kitchen, a hand-typed price that differs from the list (a warning, not a blocker), no delivery date. |
| Change CC-1003's customer | Lines re-price from the new customer's price list; the site clears because it isn't theirs. |
| Open **CC-1005** (Hollowell) | Volatile stock, but none of their sites are warded — the only fix is to drop the line. |
| Open **CC-1012** (Thornbury) | A discontinued ingredient. |
| Open **CC-1014** (Brindle & Daughters) | A customer with no price list: nothing can be ordered. |
| **Move stage** on **CC-1001** | Confirming routes by payment terms: Thornbury is on account, so it skips straight to Brewing. Other stages are greyed with why. |
| **Move stage** on **CC-1004** | Leaving Awaiting payment needs "payment received" ticked. |
| **Move stage** on **CC-1006** | Dispatch needs a courier, a tracking ref, and (it has mandrake) a hazard-seal check. |
| **Move stage** on **CC-1008** | Already dispatched: cancel is refused. |

Nothing moves backwards, and confirmed orders are locked.

## Where it lives

Demo page (private): **Cauldron & Co — Order Desk (Custom Block demo)**
`40d91b07-11ac-8137-b923-d24491932cb1` in workFlowers. The block is at the
bottom of that page, every key mapped.

| Key | Data source | ID |
| --- | --- | --- |
| `orders` | Orders | `57d24a05-3893-4ad0-9ae7-3a7cd37bc0f0` |
| `lines` | Order Line Items | `0f6076d6-d294-4a1f-bd4f-9ac17425abd1` |
| `customers` | Customers | `26eb083a-3c14-4021-84d6-4b99bfdd4c4d` |
| `sites` | Delivery Sites | `b31ba5e6-8de1-4aff-89cc-56d1ccbcdf30` |
| `ingredients` | Ingredients | `a565f603-a947-4dc4-9608-a7abc877deda` |
| `priceList` | Price List | `8b7b2d7e-ecc7-4560-91b7-eb464f138e2c` |

Property names match the manifest's, so picking each database in the config
panel maps its properties automatically.

## Develop

```bash
npm run dev:block --workspace=notion-worker-order-desk-demo
```

Open `/?mock` (port 5178 via `.claude/launch.json`); add `&theme=dark` for dark
mode, `&slow` for 1.5 s writes. The mock holds the same data as the seeded
databases and keeps writes in memory, so every flow works with nothing written
anywhere — record demos there if you'd rather not touch the live databases.

```bash
npm test --workspace=notion-worker-order-desk-demo
npm run check --workspace=notion-worker-order-desk-demo
./scripts/deploy.sh order-desk-demo
```
