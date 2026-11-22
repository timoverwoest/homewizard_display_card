// Runs tests/test.js against the card in Node (GitHub Actions). Both files run as one script,
// so the tests see HWDC just like in a browser or in JavaScriptCore.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const code = [
  fs.readFileSync(path.join(root, "homewizard_display_card.js"), "utf8"),
  fs.readFileSync(path.join(__dirname, "test.js"), "utf8"),
].join("\n;\n");
vm.runInThisContext(code, { filename: "homewizard_display_card+test.js" });
