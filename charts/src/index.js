import fs from "fs";

import GetChartData from './getChartData.js';

class GetAllChartData {

  result = []

  // Generate download promises for all region links from a page, recursively
  // Prevent parsing static data: we only need to save the JSON (half global processing time)
  download_region_links_recursive = (list) => {
    return list.map( (link) => {
      // Get this link promise
      const data = this.getChartData.get(link.url, false);
      // Return this link promise and all its children promises into an array 
      return [
          data,
          ...('children' in link ? this.download_region_links_recursive(link.children) : []),
        ]
    })
    // Flattern array of arrays
    .reduce( (result, current) => {
      result.push(...current)
      return result
    }, []);
  }

  // Generate and wait download promises for all region links from a page
  download_region_links = async (data) => {
    return await Promise.all(
      this.download_region_links_recursive(data.static)
    )
  }

  // Generate and wait download promises for all region links from a list of pages
  download_region_links_from_list = (list) => {
    return Promise.all(
      list.map( link => this.download_region_links(link.content) )
    );
  }

  // Download all the variants of a list and wait for them
  // - If `filterDefault` is true, don't download the elements with `default: true`
  parse_variants_list = async (data, {filterDefault=true, variant, selected}) => {
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
  parse_poblacio_variants = async (data, {filterDefault, selected} = {}) => {
    const list = await this.parse_variants_list(data.poblacions, {
      filterDefault,
      selected,
      variant: 'poblacio'
    });

    await this.download_region_links_from_list(list);

    return list
  }

  // Download all the territoris variants from a page
  // Also download all poblacions variants for each processed territori,
  // which will also download all region links for each processed download
  // Wait for everything to finish before continuing
  parse_territori_variants = async (data) => {
    // Download non-defaults
    const list = await this.parse_variants_list(data.territoris, {
      variant: 'territori',
    });

    // Download poblacio variants sequentially
    for (const link of list) {
      link.poblacions = await this.parse_poblacio_variants(link.content, {
        filterDefault: false,
        selected: {
          territori: link
        }
      });
    }

    return list
  }

  // Gets data and saves its static data to the results array
  // If not passed, default indexes (territori/poblacio) are used
  staticGetter = async (url, {territori, poblacio} = {}) => {

    // Ensure it has not been already downloaded
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
        link.url = this.getChartData.hashStr(link.url);
        link.name = (link.name||'CATALUNYA').trim();
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

    // Parse links found in `initial` download
    // Recursively parse new detected links
    initial.poblacions = await this.parse_poblacio_variants(initial);
    initial.territoris = await this.parse_territori_variants(initial);
    await this.download_region_links(initial);

    // Clear tree structure caches and unneeded data
    this.clearResult();

    // Save index JSON
    const file = `${this.baseJSONFile}/index.json`;
    fs.writeFile(file, JSON.stringify(this.result), err => {
      if (err) {
        console.error(err);
        throw new Error(error)
      }
    });

    // Return results for whatever reason it may be wanted to use (testing?)
    return {
      result: this.result,
      counters: this.getChartData.getCounters(),
    }
  }
}

export default GetAllChartData;
