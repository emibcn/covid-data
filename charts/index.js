import GetAllChartData from "./src/index.js";

const cmdArgs = process.argv.slice(2);
const baseHTMLFile = cmdArgs.length ? cmdArgs[0] : "cache";
const baseJSONFile = cmdArgs.length ? cmdArgs[1] : "dest";

try {
  console.log("::group::Downloading log");
  const getter = new GetAllChartData({ baseHTMLFile, baseJSONFile });
  const { result, counters } = await getter.get();
  console.log("::endgroup::");

  console.log("::group::Result");
  console.dir(result, { depth: 3 });
  console.log("::endgroup::");

  console.log(
    "Summary:",
    result.map(({ territori, poblacio }) => ({ territori, poblacio }))
  );
  console.log("Counters:", counters);
} catch (err) {
  console.log("::endgroup::");
  console.error(err);
  process.exit(1);
}
