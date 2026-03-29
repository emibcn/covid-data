import { promises as fs, constants } from "fs";
import fetch from "cross-fetch";

// SockJS like
import Socket from "./Socket.js";

// Fetch and parse list of data
import RequestsList from "./RequestsList.js";

const baseUrl =
  "https://dades.ajuntament.barcelona.cat/seguiment-covid19-bcn/__sockjs__";

// Transform a string into a smaller/hash one of it
// Remove garbage chars to prevent hash changing to the same url
const hashStr = (str = "") => {
  if (str.length === 0) {
    return 0;
  }

  return [...str]
    .map((char) => char.charCodeAt(0))
    .reduce((hash, int) => {
      const hashTmp = (hash << 5) - hash + int;
      return hashTmp & hashTmp; // Convert to 32bit integer
    }, 0);
};

class GetAllData {
  sock = null;
  result = [];
  counters = {
    downloaded: 0,
    read: 0,
  };

  errors = {
    count: 0,
    messages: [],
  };

  constructor({ baseHTMLFile, baseJSONFile, disableCache }) {
    this.baseHTMLFile = baseHTMLFile;
    this.baseJSONFile = baseJSONFile;
    this.disableCache = disableCache;
  }

  // Treat data errors as warnings:
  // Show and summarize them, but keep processing
  parseDataErrors = (name, errors) => {
    if (errors?.length) {
      const title = `Errors found in '${name}' data fetch:`;
      console.warn(title);

      let combined = `${title}\n`;
      for (const error in errors) {
        combined += `- ${error}\n`;
        console.warn(`- ${error}`);
      }

      this.errors.count += errors.length;
      this.errors.messages.push(combined);
    } else if ("custom" in errors) {
      const title = `Errors found in '${name}' data fetch:\n - ${errors.custom.alert}`;
      console.warn(title);
      this.errors.count++;
      this.errors.messages.push(title);
    }
  };

  // Handles a single request process
  handleRequest = async ({ query, validate, force }) => {
    // Send request to server:
    // - It may need to auto-(re)connect the socket
    // - It may need to re-send the request
    // - Looks for correct results (JSON object)
    // - Validates with request validate callback
    return await this.sock.send(query, validate, force);
  };

  // Cache responses to files
  // If cache exists, return results from there
  // If not, do the request and save its results to cache
  readFromFileOrHandleRequest = async (request) => {
    const { query: _query, ...restRequest } = request;
    const query = typeof _query === "function" ? _query() : _query;
    const hash = hashStr(query);
    const file = `${this.baseHTMLFile}/response.json?${hash}`;

    let data;

    // Try to read data from cached file
    try {
      if (this.disableCache) {
        throw new Error("Cache temporarily disabled");
      }

      // If forced, throw error to jump to catch block
      if (request.force) {
        throw new Error("Forced request download");
      }

      const dataStr = await fs.readFile(file, "utf8");

      // Parse the JSON into a JS object and, then, the request parse
      data = JSON.parse(dataStr);

      console.warn(`Request read from file '${file}': '${hash}'`);

      // Increment read counter only if it was ok
      this.counters.read++;
    } catch (err) {
      console.log(
        `The file '${file}' was not read from cache: fetch '${hash}':`,
        err.message,
      );

      // Try to download a fresh copy from web
      data = await this.handleRequest({ query, ...restRequest });

      // Once downloaded, save page into cache file
      console.log(`Save response from '${hash}' to file '${file}'.`);
      try {
        await fs.writeFile(file, JSON.stringify(data));
      } catch (err) {
        throw new Error(
          `Saving cache for '${hash}': ${err.name}: ${err.message}`,
        );
      }

      // Do request parsing (already parsed the JSON)
      const parsed = await request.parse(data, this.parseDataErrors);

      // Increment downloaded counter only if it was ok
      this.counters.downloaded++;
    }

    try {
      return request.parse(data, this.parseDataErrors);
    } catch (err) {
      console.error(err);
      throw new Error(`Error parsing the results: ${err.message}`);
    }
  };

  // Generates the results array from requests definitions
  getResultsFromRequests = async (requests) => {
    const result = [];

    // Handle each request, using its validator and its parser to
    // generate (or not) array elements
    for (const request of requests) {
      const parsed = await this.readFromFileOrHandleRequest(request);

      // There are steps which don't need to be saved
      // Returning `null` they are not added to the results
      if (parsed !== null) {
        result.push(parsed);
      }
    }

    return result;
  };

  // Downloads and parses everything
  get = async () => {
    // Instantiate the socket downloader
    this.sock = new Socket(baseUrl);

    // Get result array
    try {
      this.result = await this.getResultsFromRequests(RequestsList);
    } catch (err) {
      console.error(err);
      throw err;
    }

    // Close download streaming fetch
    await this.sock.close();

    // Strip JSON into an Index and sub parts
    console.log("Saving JSON files");
    const files = [];
    const moveValuesToFile = (result, prefix = "") => {
      if ("values" in result) {
        const name = `${prefix}${result.code}.${result.extension ?? "json"}`;
        files.push({
          name,
          values: result.values,
        });
        result.values = name;
        delete result.extension;
      }
    };

    // Parse `result.values` and `result.sections[*].values` into different files
    for (const result of this.result) {
      moveValuesToFile(result);
      if ("sections" in result) {
        for (const section of result.sections) {
          moveValuesToFile(section, `${result.code}-`);
        }
      }
    }

    // Add index JSON
    files.push({
      name: "index.json",
      values: this.result,
    });

    // Save all files
    for (const file of files) {
      try {
        await fs.writeFile(
          `${this.baseJSONFile}/${file.name}`,
          typeof file.values === "string"
            ? file.values
            : JSON.stringify(file.values),
        );
      } catch (err) {
        console.error(err);
        throw new Error(error);
      }
    }

    // Return results for whatever reason it may be wanted to use (testing?)
    return {
      result: this.result,
      errors: this.errors,
      counters: {
        ...this.counters,
        processed: this.result.length,
        files: files.length,
        errors: this.errors.count,
      },
    };
  };
}

export default GetAllData;
export { hashStr }; // For unit testing
