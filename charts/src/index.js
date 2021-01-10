import {promises as fs, constants} from "fs";

import GetChartData, {wait, hashStr} from './getChartData.js';

// Downloads all charts data, getting all links from combining form options
//
// - Initial download:
//   - Get available variants URLs from the static default data (empty/default form selectors/menu)
//     - Only one variant modified URLs (still needs 2-variants'
//       modified URLs, available in next parsed URLs)
//     - First get available population variants: "total" (default), "general" and "residència"
//     - Then get available territori variants: "REGIÓ/AGA" (default) and "COMARQUES"
//       - For each one, download pending (non default) population variants: ("COMARQUES") x ("general" & "residència")
// - For each downloaded page (initial, only one variant modified URLs, two variants modified URLs),
//   get, download and parse all regions URLs and save statistical data (recursive z-axys).
//   - Collect download promise generators during static parsing
//   - Execute all collected download generators at the end, rate limited
// - All downloads are fail-tolerant and will be read from disk cache if a corresponding file exists
class GetAllChartData {

  result = []
  collectedRegionLinksGenerators = []

  // Creates download promises generators for all region links from a page, recursively
  // Prevent parsing static data: we only need to save the JSON (half global processing time)
  collectRegionLinksRecursive = (list) =>
    list
      .map( ({url, children}) => [
        // Return this link promise generator and all its children promises generators into an array
        // Get this link promise generator: `false` => Don't parse static data
        () => this.getChartData.get(url, false),
        ...(children ? this.collectRegionLinksRecursive(children) : []),
      ])

      // Flattern array of arrays
      .reduce( (result, current) => {
        result.push(...current)
        return result
      }, []);

  // Collects download promises generators for all region links from a page
  collectRegionLinks = (data) => {
    this.collectedRegionLinksGenerators.push(
      ...this.collectRegionLinksRecursive(data.static)
    );
  }

  // Downloads links from collected generators, rate limited
  downloadCollectedRegionLinks = async () => {
    const MAX_REQUESTS_PER_SECOND = 1.8;
    const delay = Math.floor( 1000/MAX_REQUESTS_PER_SECOND );
    const pending = [];

    console.log(`==> Download collected region links, rate limited to ${MAX_REQUESTS_PER_SECOND} requests per second`);
    for( const generator of this.collectedRegionLinksGenerators ) {
      pending.push( generator() );
      await wait(delay);
    }

    console.log("==> Await pending promises");
    await Promise.all( pending );
  }

  // Generate download promises for all region links from a list of pages
  collectRegionLinksFromList = (list) => {
    list.map( link => this.collectRegionLinks(link.content) )
  }

  // Download all the variants of a list and wait for them
  // - If `filterDefault` is true, don't download the elements with `default: true`
  parseVariantsList = async (data, {filterDefault=true, variant, selected}) => {
    // Filter default (if needed)
    const list = data
      .filter( link => !link.default || !filterDefault);

    // Download variants sequentially
    for (const link of list) {
      link.content = await this.staticGetter(link.url, {
        ...selected,
        [variant]: link,
      });
    }

    return list;
  }

  // Download all the poblacions variants from a page
  // Also download all region links for each processed poblacio
  parsePoblacioVariants = async (data, {filterDefault, selected} = {}) => {
    const list = await this.parseVariantsList(data.poblacions, {
      filterDefault,
      selected,
      variant: 'poblacio'
    });

    this.collectRegionLinksFromList(list);

    return list
  }

  // Download all the territoris variants from a page
  // Also download all poblacions variants for each processed territori,
  // which will also download all region links for each processed download
  // Wait for everything to finish before continuing
  parseTerritoriVariants = async (data) => {
    // Download non-defaults
    const list = await this.parseVariantsList(data.territoris, {
      variant: 'territori',
    });

    // Download poblacio variants sequentially
    for (const link of list) {
      link.poblacions = await this.parsePoblacioVariants(link.content, {
        filterDefault: false,
        selected: {
          territori: link
        }
      });
    }

    return list
  }

  // Gets data and saves its static data to the results array
  // If not passed, default indexes (territori/poblacio) are used (the
  // corresponding to empty/not selected ones/initial link)
  staticGetter = async (url, {territori, poblacio} = {}) => {

    // Ensure it has not been already downloaded (deduplicate)
    if ( (territori && poblacio) || this.result.length ) {
      const found = this.result.find( link =>
        link.territori === ( territori?.name ?? this.result[0].territori ) &&
        link.poblacio === ( poblacio?.name ?? this.result[0].poblacio )
      );

      if (found) {
        return found.chart;
      }
    }

    // If not found, try to download
    const chart = await this.getChartData.get(url);

    // Add resulting data into result array, with indexes
    this.result.push({
      chart,
      url,
      territori: ( territori?.name ?? chart.territoris.find(t => t.default).name ),
      poblacio: ( poblacio?.name ?? chart.poblacions.find(t => t.default).name ),
    });

    return chart;
  }

  // Clear temporal/unneeded data
  clearResult = () => {
    this.result.forEach( result => {
      result.children = result.chart.static;
      
      delete result.chart;
      delete result.territori.poblacions;
      delete result.territori.content;
      delete result.poblacio.content;
    });

    // Shorten URLs, recursively (half size for index.json)
    // Also trim names
    const hashUrls = (list) => {
      list.forEach( link => {
        link.url = hashStr(link.url);
        link.name = (link.name||'CATALUNYA').trim();

        // Recurse
        if ('children' in link) {
          hashUrls(link.children);
        }
      });
    };

    hashUrls(this.result);
  }

  // Used to save JSON global index file
  baseJSONFile = '';

  constructor({ baseHTMLFile, baseJSONFile }) {
    this.baseJSONFile = baseJSONFile;
    // Instantiate the downloader
    this.getChartData = new GetChartData({ baseHTMLFile, baseJSONFile });
  }

  // Downloads and parses everything
  get = async () => {

    // Initialize results array
    this.result = [];

    // Do initial download, which will give the rest
    // of intermediate index and final links
    const initial = await this.staticGetter();

    // Collect region links from initial page
    this.collectRegionLinks(initial);

    // Parse links found in `initial` download
    // Recursively parse new detected links
    initial.poblacions = await this.parsePoblacioVariants(initial);
    initial.territoris = await this.parseTerritoriVariants(initial);

    // Download all region links (rate limited)
    await this.downloadCollectedRegionLinks();

    // Clear tree structure caches and unneeded data
    this.clearResult();

    // Save index JSON
    const file = `${this.baseJSONFile}/index.json`;
    try {
      await fs.writeFile(file, JSON.stringify(this.result));
    } catch(err) {
      console.error(err);
      throw new Error(err)
    }

    // Return results for whatever reason it may be wanted to be used (testing?)
    return {
      result: this.result,
      counters: this.getChartData.getCounters(),
    }
  }
}

export default GetAllChartData;
