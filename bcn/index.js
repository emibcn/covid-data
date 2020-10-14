import GetAllChartData from "./src/index.js";

const cmdArgs = process.argv.slice(2);
const baseHTMLFile = cmdArgs.length ? cmdArgs[0] : 'cache';
const baseJSONFile = cmdArgs.length ? cmdArgs[1] : 'dest';

console.log(process.env.NODE_ENV);

try {

  console.log("::group::Downloading log");
  const getter = new GetAllChartData({baseHTMLFile, baseJSONFile});
  const { result, errors, counters }  = await getter.get();
  console.log("::endgroup::");

  console.log("::group::Result");
  console.dir(result, {depth: null});
  console.log("::endgroup::");

  if (errors.count) {
    console.error("Errors during download:", errors.count);
    errors.messages.forEach( message => console.error(message) );
  }

  console.log("Counters:", counters);

} catch(err) {

  console.log("::endgroup::");
  console.error(err);
  process.exit(1);

}
