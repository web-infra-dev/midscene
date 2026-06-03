---
name: catalog
description: >-
  Look up demo-shop catalog products and their expected prices. Use this skill
  whenever a test references $catalog to confirm a product exists and to report
  its canonical price.
---

# Catalog skill

This demo skill represents an external source of truth a real test might query
(a database, an internal API, a price service). For the demo it is static.

Known catalog products:

| Product        | SKU   | Expected price |
| -------------- | ----- | -------------- |
| Running Shoes  | sku-1 | $89.00         |
| Trail Backpack | sku-2 | $129.00        |

When asked to confirm a product:

1. Find the product by name in the table above.
2. If it exists, report it as a known catalog product and state the expected
   price.
3. If it does not exist, say so clearly — the verification should fail.

In a real project this skill would run a command or call an API to fetch the
truth. Replace the static table with that lookup.
