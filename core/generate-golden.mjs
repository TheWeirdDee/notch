// Generates core/fixtures/golden/<case>.json by running the reviewed instantiate()/
// apply() implementation once per fixture. This is the standard golden-file workflow:
// re-run after a deliberate model change and diff the result before committing it, so
// a golden file always documents what a human reviewed, not just what the code did.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { instantiate } from "./src/instantiate.ts";
import { apply } from "./src/apply.ts";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));
const goldenDir = fileURLToPath(new URL("./fixtures/golden", import.meta.url));
mkdirSync(goldenDir, { recursive: true });

const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));

for (const file of files) {
  const fixture = JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"));
  let golden;

  switch (fixture.operation) {
    case "instantiate": {
      golden = instantiate(fixture.proof, null);
      break;
    }
    case "instantiate_twice": {
      const first = instantiate(fixture.first, null);
      const second = instantiate(fixture.second, first.ok ? first.claim : null);
      golden = { first, second };
      break;
    }
    case "apply": {
      golden = apply(fixture.loan, fixture.claim);
      break;
    }
    case "apply_sequence": {
      let currentClaim = fixture.claim;
      const results = [];
      for (const loan of fixture.loans) {
        const result = apply(loan, currentClaim);
        results.push(result);
        if (result.ok) currentClaim = result.claim;
      }
      golden = { results };
      break;
    }
    default:
      throw new Error(`${file}: unknown operation ${fixture.operation}`);
  }

  writeFileSync(new URL(`./fixtures/golden/${file}`, import.meta.url), JSON.stringify(golden, null, 2) + "\n");
  console.log(`wrote golden/${file}`);
}
