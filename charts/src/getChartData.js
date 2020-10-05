import {promises as fs, constants} from "fs";
// Use Node fetch
import fetch from 'cross-fetch';

import parseStatic from "./parseStatic.js";
import parseChart from "./parseChart.js";

const baseUrl = "https://dadescovid.cat";

class GetChartData {

  baseHTMLFile = '';
  baseJSONFile = '';

  constructor({baseHTMLFile, baseJSONFile}) {
    this.baseHTMLFile = baseHTMLFile;
    this.baseJSONFile = baseJSONFile;
  }

  // Parses all the data from a page into a single JSON object
  parse = (data, processStatic=true) => {
    return {
      ...(processStatic ? {staticData: parseStatic(data)} : {}),
      chartData: parseChart(data),
    }
  };

  // Raises exception on response error
  handleFetchErrors = (response) => {
    // Raise succeeded non-ok responses
    if ( !response.ok ) {
      throw new Error(response.statusText);
    }
    return response;
  }

  // Promis based setTimeout (async/await compatible)
  wait = (seconds) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(), seconds);
    });
  }

  // Transform a string into a smaller/hash one of it
  hashStr = (str='') => {
    if (str.length === 0) {
      return 0;
    }
  
    return [...str]
      .map( char => char.charCodeAt(0) )
      .reduce( (hash, int) => {
        const hashTmp = ((hash << 5) - hash) + int;
        return hashTmp & hashTmp; // Convert to 32bit integer
      }, 0)
  }

  // Fetch an endpoint, retrying `n` times before giving up
  // Wait random periods between tries
  fetch_retry = async (url, options, n=20) => {
    try {
      return await fetch(url, options).then( this.handleFetchErrors )
    } catch(err) {
      // No more retries left
      if (n === 1) {
        throw err;
      }

      // Wait randomly between 20 and 40 seconds
      const millis = Math.floor((Math.random() * 20_000 + 20_000));
      console.log(`Warning '${url}' failed (${n-1} retries left, wait ${millis/1_000}): ${err.name}: ${err.message}`);
      await this.wait( millis );

      // Retry download
      console.log(`Retry ${n-1} '${url}'...`);
      return await this.fetch_retry(url, options, n - 1);
    }
  }

  // Gets chart data:
  // - If file exists, parses its content;
  // - Else, downloads it, saves it to the file and parses that
  // Finally, save resulting JS object into a JSON file
  // Keeps a global counter of downloaded pages and processed data's
  counters = {
    downloaded: 0,
    read: 0,
    processed: 0,
  };

  // Try to read data from cached file or download from web
  read_or_download = async (url) => {
    const file = `${this.baseHTMLFile}/index.html${url.replace('/', '_')}`;
    let data;

    // Try to read data from cached file
    try {
      await fs.access(file, constants.F_OK);
      console.log(`The file '${file}' exists.`);
      try {
        data = await fs.readFile(file, 'utf8');
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
        const response = await  this.fetch_retry(`${baseUrl}${url}`)
        this.handleFetchErrors(response);
        data = await response.text();
      } catch(err) {
        throw new Error(`Downloading '${url}': ${err.name}: ${err.message}`)
      }

      // Once downloaded, save page into cache file
      try {
        await fs.writeFile(file, data);
      } catch(err) {
        throw new Error(`Saving cache for '${url}': ${err.name}: ${err.message}`)
      }

      // Increment downloaded counter only if it was ok
      this.counters.downloaded++;
    }

    return data
  }

  // Reads or downloads a page URL content and parses it
  get = async (url='', processStatic=true) => {

    // Try to read data from cached file or download from web
    const data = await this.read_or_download(url);

    // Try to parse page
    let parsed;
    try {
      parsed = await this.parse(data, processStatic);
    } catch (err) {
      throw new Error(`Parsing '${url}': ${err.name}: ${err.message}`)
    }

    // Save parsed JSON chart data to file
    const {chartData, staticData} = parsed;
    try {
      // URL shortener for file name
      const hash = `?${this.hashStr(url)}`;

      await fs.writeFile(
        `${this.baseJSONFile}/chart.json${hash}`,
        JSON.stringify( {
          ...chartData,
          url
        })
      );
    } catch(err) {
      throw new Error(`Saving JSON for '${url}': ${err.name}: ${err.message}`)
      throw error
    }

    // Increment processed counter only if everything was ok
    this.counters.processed++;

    // Only return the static data: chart data only needs to be saved into a file
    return staticData
  }

  // Used to summarize processed data
  getCounters = () => this.counters;
}

export default GetChartData;
