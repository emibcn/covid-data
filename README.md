![Download maps from backend and publish with GitHub Pages](https://github.com/emibcn/covid-data/workflows/Download%20maps%20from%20backend%20and%20publish%20with%20GitHub%20Pages/badge.svg)

# Covid Data

This repo is used to store and serve daily collected data from https://dadescovid.org (institutional data published by the __Generalitat de Catalunya__ ) into GitHub pages. The reasons for collecting this data are:
- The data will be used from apps which don't need more than daily updates, like [Covid Data `Refactored`](https://emibcn.github.io/covid/), an [open source serverless Progressive Web Application](https://github.com/emibcn/covid)
- Original data requests might be blocked by CORS or other technologies
- Original servers and data might not be efficient enough
- When applicable, normalize data from various servers

The collected data is minimally adapted before publishing it:
- Transform JS statements into JSON objects
- Reduce some non-visible `id`'s to reduce users and servers resource consumptions

This repo might collect other data in the future, from the same server, it's [backend server](https://analisi.transparenciacatalunya.cat/) or from 3rd party servers (EU statistics servers? Data collection from other territories?).

# Techie

The data is collected by an ugly [BASH sccript](./bin/download-map-data.sh). This script collects the interesting parts (maps SVG source, JS code with data on it) and saves them into files. The SVG files are saved transparently. The JS files are executed with NODE to ouput the collected data as JSON.

This process is executed from a [GitHub Workflow](./.github/workflows/get-maps.yml) (`cron` scheduled some minuts after official data publication at 10am CEST). Once the data is obtained, deploy it to this repo' GitHub Pages in the `gh-pages` branch.

# License

The license of the data is the same as the original: [Open Data Commons Attribution License](http://opendatacommons.org/licenses/by/1.0/), as stated in [the backend API page](https://analisi.transparenciacatalunya.cat/Salut/Dades-setmanals-de-COVID-19-per-comarca/jvut-jxu8).
