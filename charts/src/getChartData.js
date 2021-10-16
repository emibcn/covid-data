import { promises as fs, constants } from "fs";

import fetchRetry from "./fetchRetry.js";
import parse from "./parse.js";

const baseUrl = "https://dadescovid.cat";

// Transform a string into a smaller/hash one of it
// Remove garbage chars to prevent hash changing to the same url
const hashStr = (str = "") => {
  if (str.length === 0) {
    return 0;
  }

  return [...`${str}`.replace(/&id_html=[^&]*/, "")]
    .map((char) => char.charCodeAt(0))
    .reduce((hash, int) => {
      const hashTmp = (hash << 5) - hash + int;
      return hashTmp & hashTmp; // Convert to 32bit integer
    }, 0);
};

//
// Getter and parser for URLs (one by one)
// Writes to files cache and JSON statistical data
//
// - Gets data:
//   - Creates a HASH with the URL (deduplicating)
//   - Reads from cached file with HASH as name
//   - Reads from downloaded data from URL:
//     - Only if cached file was not found
//     - If downloaded, save cache file using HASH as name
//     - If there is an error downloading, retry several times
//       awaiting some time betwen retries before giving up.
//       Configurable passing `fetchOptions` to constructor.
// - Parses data:
//   - Static data:
//     - Conditionally by argument (default: true)
//     - Indexes the links from the menu, with recursing regions list,
//       using HASH as URL instead of the original URL
//     - Varies depending on the options selected in the URL:
//       - Needs to be parsed -almost- once for each combination
//         of (region type) x (population type)
//     - Returned to callee, letting it know the collected URLs to be parsed
//   - Chart data:
//     - Always parsed
//     - Statistics data used in the web app widgets
//     - Save JSON into a file, using HASH as file name
//     - NOT returned to callee (only saved into JSON file)
class GetChartData {
  baseHTMLFile = "";
  baseJSONFile = "";

  constructor({ baseHTMLFile, baseJSONFile, fetchOptions = {} } = {}) {
    this.baseHTMLFile = baseHTMLFile;
    this.baseJSONFile = baseJSONFile;
    this.fetchOptions = fetchOptions;
  }

  // Gets chart data:
  // - If file exists, parses its content;
  // - Else, downloads it, saves it to the file and parses that
  // - Finally, save resulting JS object into a JSON file
  // - Keeps a global counter of downloaded pages and processed data's
  counters = {
    downloaded: 0,
    read: 0,
    processed: 0,
  };

  // Try to read data from cached file or download from web
  readOrDownload = async (url, hash) => {
    const file = `${this.baseHTMLFile}/index.html${hash}`;
    let data;

    // Try to read data from cached file
    try {
      await fs.access(file, constants.F_OK);
      console.log(`The file '${file}' exists. DON'T fetch '${url}'`);
      try {
        data = await fs.readFile(file, "utf8");
      } catch (err) {
        console.error(err);
        throw err;
      }

      // Increment read counter only if it was ok
      this.counters.read++;
    } catch (err) {
      console.log(`The file '${file}' does NOT exists: fetch '${url}'`);

      // Try to download a fresh copy from web
      try {
        const response = await fetchRetry(
          `${baseUrl}${url}`,
          this.fetchOptions
        );
        data = await response.text();
      } catch (err) {
        throw new Error(`Downloading '${url}': ${err.name}: ${err.message}`);
      }

      // Once downloaded, save page into cache file
      try {
        await fs.writeFile(file, data);
      } catch (err) {
        throw new Error(
          `Saving cache for '${url}' to '${file}': ${err.name}: ${err.message}`
        );
      }

      // Increment downloaded counter only if it was ok
      this.counters.downloaded++;
    }

    return data;
  };

  // Reads or downloads a page URL content and parses it
  get = async (url = "", processStatic = true) => {
    // URL shortener for file name
    const hash = `?${hashStr(url)}`;

    // Try to read data from cached file or download from web
    const data = await this.readOrDownload(url, hash);

    // Try to parse page
    let parsed;
    try {
      parsed = await parse(data, processStatic);
    } catch (err) {
      throw new Error(`Parsing '${url}': ${err.name}: ${err.message}`);
    }

    // Save parsed JSON chart data to file
    const { chartData, staticData } = parsed;
    try {
      await fs.writeFile(
        `${this.baseJSONFile}/chart.json${hash}`,
        JSON.stringify({
          ...chartData,
          url,
        })
      );
    } catch (err) {
      throw new Error(`Saving JSON for '${url}': ${err.name}: ${err.message}`);
    }

    // Increment processed counter only if everything was ok
    this.counters.processed++;

    // Only return the static data: chart data only needs to be saved into a file
    return staticData;
  };

  // Used to summarize processed data
  getCounters = () => this.counters;
}

export default GetChartData;
export { hashStr };
