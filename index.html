![Download maps and charts from backend and publish with GitHub Pages](https://github.com/emibcn/covid-data/workflows/Download%20maps%20and%20charts%20from%20backend%20and%20publish%20with%20GitHub%20Pages/badge.svg)

# Covid Data

This repo is used to store and serve daily collected data from https://dadescovid.org (institutional data published by the **Generalitat de Catalunya** ) and [Seguiment Covid19 BCN](https://dades.ajuntament.barcelona.cat/seguiment-covid19-bcn) (institutional data collected and published by the **Ajuntament de Barcelona**) into GitHub pages. The reasons for collecting this data are:
- The data will be used from apps which don't need more than daily updates, like [Covid Data `Refactored`](https://emibcn.github.io/covid/), an [open source serverless Progressive Web Application](https://github.com/emibcn/covid)
- Original data requests might be blocked by CORS or other technologies
- Original servers and data might not be efficient enough
- When applicable, normalize data from various servers

The collected data from https://dadescovid.cat is minimally adapted before publishing it:

Maps:
- Transform JS statements into JSON objects
- Reduce some non-visible `id`'s to reduce users and servers resource consumptions

Charts:
- Transform JS statements into JSON objects
- Transform HTML tags attributes and content into JSON structured data

The collected data from [Seguiment Covid19 BCN](https://dades.ajuntament.barcelona.cat/seguiment-covid19-bcn) is deeply reshaped, throwing away the unneded/repetitive data.

This repo might collect other data in the future, from the same server, it's [backend server](https://analisi.transparenciacatalunya.cat/) or from 3rd party servers (EU statistics servers? Data collection from other regions?).

# Techie

This process is executed from a [GitHub Workflow](./.github/workflows/get-maps-and-charts.yml) (`cron` scheduled some minuts after official data publication at 10am CEST). Once the data is obtained, deploy it to this repo' GitHub Pages in the `gh-pages` branch.

## Maps
The data is collected by an ugly [BASH script](./bin/download-map-data.sh). This script collects the interesting parts (maps SVG source, JS code with data on it) and saves them into files. The SVG files are saved transparently. The JS files are executed with NODE to ouput the collected data as JSON.

## Charts
The data is collected by a [NodeJS package](./charts/). This script scrapes data from HTML tags and JS code. It generates individual JSON files for each region/population selectors, and a global JSON index file with the regions recursive structure and all the download links. Deep use of `async`/`await`.

## Barcelona
The data is collected by a [nice NodeJS package](./bcn/). This script uses a self made version of [SockJS](./bcn/src/Socket.js) to scrape data from a [RStudio/Shiny](https://github.com/rstudio/shiny) server. It generates individual JSON files for each datasource or datasource section, and a global JSON index file with the data and all the download links. Deep use of `async`/`await`. Some use of Streams and Iterator Generator and deep use of `async`/`await`. Very funny stuff!

# License

The application, scripts and documentation in this project are released under the [GNU General Public License v3.0](./LICENSE).

The license of the data scraped from https://dadescovid.cat and saved into the directories `Charts` and `Maps` is the same as the original: [Open Data Commons Attribution License](http://opendatacommons.org/licenses/by/1.0/), as stated in [the backend API page](https://analisi.transparenciacatalunya.cat/Salut/Dades-setmanals-de-COVID-19-per-comarca/jvut-jxu8) owned by the _Generalitat de Catalunya_.

The license of the data scraped from https://dades.ajuntament.barcelona.cat/seguiment-covid19-bcn is the same as the original: [Creative Commons CC-BY](https://creativecommons.org/licenses/by/2.0/). The owner is the _Ajuntament de Barcelona_.
