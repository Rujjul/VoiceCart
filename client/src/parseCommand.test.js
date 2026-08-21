import { parseShoppingCommand } from "./parseCommand.js";

const cases = [
  ["a dozen of bananas", { action: "add", item: "Bananas", quantity: 12, unit: "pcs", category: "produce" }],
  ["3 packets of milk", { action: "add", item: "Milk", quantity: 3, unit: "packet", category: "dairy" }],
  ["three packets of milk", { action: "add", item: "Milk", quantity: 3, unit: "packet", category: "dairy" }],
  ["1 kilo of gram flour", { action: "add", item: "Gram Flour", quantity: 1, unit: "kg", category: "pantry" }],
  ["2 kg rice", { action: "add", item: "Rice", quantity: 2, unit: "kg", category: "pantry" }],
  ["6 apples", { action: "add", item: "Apples", quantity: 6, unit: "pcs", category: "produce" }],
  ["a bottle of ketchup", { action: "add", item: "Ketchup", quantity: 1, unit: "bottle", category: "pantry" }],
  ["2 rolls of toilet paper", { action: "add", item: "Toilet Paper", quantity: 2, unit: "roll", category: "household" }],
  ["also a roll of toilet paper", { action: "add", item: "Toilet Paper", quantity: 1, unit: "roll", category: "household" }],
  ["500 ml juice", { action: "add", item: "Juice", quantity: 500, unit: "ml", category: "beverages" }],
  ["2 kg potatoes", { action: "add", item: "Potatoes", quantity: 2, unit: "kg", category: "produce" }],
  ["4 bottles of water", { action: "add", item: "Water", quantity: 4, unit: "bottle", category: "beverages" }],
  ["add milk", { action: "add", item: "Milk", quantity: 1, unit: "pcs", category: "dairy" }],
  ["Umm, can you add like 4 packets of milk please", { action: "add", item: "Milk", quantity: 4, unit: "packet", category: "dairy" }],
  ["Add, uh, maybe two loaves of bread", { action: "add", item: "Bread", quantity: 2, unit: "loaf", category: "bakery" }],
  ["please put 4 milk packets", { action: "add", item: "Milk", quantity: 4, unit: "packet", category: "dairy" }],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = parseShoppingCommand(input);
  const ok =
    got &&
    got.action === expected.action &&
    got.item === expected.item &&
    got.quantity === expected.quantity &&
    got.unit === expected.unit &&
    got.category === expected.category;
  if (!ok) {
    failed += 1;
    console.error("FAIL", input, { expected, got });
  } else {
    console.log("OK  ", input, "→", `${got.quantity} ${got.unit} ${got.item} (${got.category})`);
  }
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\n${cases.length} passed`);
