import {promises as fs, constants} from "fs";
import fetch from 'cross-fetch';

// SockJS like
import Socket from './Socket.js';

// Fetch and parse list of data
import RequestsList from './RequestsList.js';

const baseUrl = "https://dades.ajuntament.barcelona.cat/seguiment-covid19-bcn/__sockjs__";

class GetAllData {

  sock = null;
  result = [];
  errors = {
    count: 0,
    messages: [],
  };

  constructor({ baseHTMLFile, baseJSONFile }) {
    this.baseJSONFile = baseJSONFile;
  }

  // Treat data errors as warnings:
  // Show and summarize them, but keep processing
  parseDataErrors = (name, errors) => {
    if (errors.length) {
      const title = `Errors found in '${name}' data fetch:`;
      console.warn(title);

      let combined = `${title}\n`;
      for (const error in errors) {
        combined += `- ${error}\n`;
        console.warn(`- ${error}`);
      }

      this.errors.count += errors.length;
      this.errors.messages.push(combined);
    }
  }

  // Handles a single request process
  handleRequest = async ({query, validate, parse}) => {

    // Send request to server:
    // - It may need to auto-(re)connect the socket
    // - It may need to re-send the request
    // - Looks for correct results (JSON object)
    // - Validates with request validate callback
    const response = await this.sock.send( query, validate );
    return parse(response, this.parseDataErrors);
  }

  // Generates the results array from requests definitions
  getResultsFromRequests = async (requests) => {
    const result = [];

    // Handle each request, using its validator and its parser to
    // generate (or not) array elements
    for(const request of requests) {
      const parsed = await this.handleRequest(request);

      // There are steps which don't need to be saved
      // Returning `null` they are not added to the results
      // TODO: Should return instead of yield if this is the last request
      if (parsed !== null) {
        result.push(parsed);
      }
    }

    return result;
  }

  // Downloads and parses everything
  get = async () => {

    // Instantiate the socket downloader
    this.sock = new Socket(baseUrl);

    // Get result array
    try {
      this.result = await this.getResultsFromRequests(RequestsList);
    } catch(err) {
      console.error(err);
      throw err;
    }

    // Close download streaming fetch
    this.sock.close();

    // Strip JSON into an Index and sub parts
    const files = [];
    const moveValuesToFile = (result, prefix='') => {
      if ('values' in result) {
        const name = `${prefix}${result.code}.json`;
        files.push({
          name,
          values: result.values,
        });
        result.values = name;
      }
    };

    // Parse `result.values` and `result.sections[*].values` into different files
    for (const result of this.result) {
      moveValuesToFile(result);
      if ('sections' in result) {
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
          JSON.stringify(file.values)
        );
      } catch(err) {
        console.error(err);
        throw new Error(error)
      }
    }

    // Return results for whatever reason it may be wanted to use (testing?)
    return {
      result: this.result,
      counters: {
        downloaded: this.result.length,
        errors: this.errors,
        files: files.length,
      },
    }
  }
}

export default GetAllData;
