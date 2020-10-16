// Scraped from official web:
// - Source at: https://dades.ajuntament.barcelona.cat/seguiment-covid19-bcn/
// - Look in the development console (into the `Network` tab) for 'xhr' connections to 'https://.../xhr_send'
// - We don't need them parsed, just as plain JSON strings
import Queries from './QueriesPlain.js';

//
// Requests/parsers helpers
//

// Menu
import {findMenu, parseMenu, parseOptions} from './MenuHelpers.js';

//
// Global helpers
//

const Globals = {
  // Save menu structured data to allow other requests to use its info
  menu: null,
  // Save regions to ask for more data
  paisos: null,
  provincies: null,
  municipis: null,
};

// Parses a graph: They all have the same shape
const parseGraph = (graph, data) => ({
  code: graph,
  description: data.values[`txtDescripcio${graph}`],
  title: data.values[`txtTitolDescripcio${graph}`],
  theme: {
    colors: data.values[`plot_${graph}`].x.theme.colors,
    decimals: data.values[`plot_${graph}`].x.theme.tooltip.valueDecimals,
  },
  yAxis: {
    scale: data.values[`plot_${graph}`].x.hc_opts.plotOptions.treemap.layoutAlgorithm,
    type: data.values[`plot_${graph}`].x.hc_opts.yAxis.type,
    label: data.values[`plot_${graph}`].x.hc_opts.yAxis.title.text,
  },
  source: {
    text: data.values[`txtFont${graph}`].replace(/^.*<a[^>]*>([^<]*)<\/a>.*/, '$1'),
    url: data.values[`txtFont${graph}`].replace(/^.*<a [^>]*? href='([^']*)'>.*/, '$1'),
  },
  values: data.values[`plot_${graph}`].x.hc_opts.series
    .map(({name, type, tooltip, data}) => ({
      name: name ?? tooltip.pointFormat.replace(/^<b>([^:]*):.*$/, '$1'),
      type,
      format: tooltip.pointFormat.replace(/^[^:]*: \{[^:]*:([^}]*)\}([^<]*).*$/, '{$1}$2'),
      data: data.map(({y}) => y),
      range: [ // Date range
        data[0].DadesVariableX,
        data[ data.length - 1 ].DadesVariableX
      ],
      dates: data.map( d => d.DadesVariableX ),
    }))
});

const parseGraphResponseFactory = (name, menuCode, debug=false) => {
  return (data, parseErrors) => {

    // Parse possible errors
    parseErrors(name, data.errors);

    // Log to visually find valuable data
    if (debug) {
      console.dir(data, {depth: null});
    }

    // Get related menu item to get the dataset title
    const menuOption = findMenu(menuCode, Globals.menu);

    const rePlot = /^plot_/;

    // Transform data shape
    return {
      code: menuOption.code,
      title: menuOption.name,
      type: 'graph',
      sections: Object.keys(data.values)
        // Detect graph in data
        .filter( v => rePlot.test(v))

        // Transform to graph code
        .map( v => v.replace(rePlot, ''))

        // Re-shape graph data
        .map(graph => parseGraph(graph, data)),
    };
  }
}

const graphRequestFactory = (name, menuCode, query, debug=false) => ({
  query,
  validate: (parsed) => parsed?.values && true,
  parse: parseGraphResponseFactory(name, menuCode),
});

const RequestsList = [

  // 
  // INSTRUCTIONS;
  // - Save Queries into `./QueriesPlain.js`
  // - Use `validate` to find a field in a correct result. This streaming stuff sends a lot of garbage
  //   Normally, `(parsed) => parsed?.values && true` is a good option
  // - Use `parse` to:
  //   - Re-shape a JS object
  //   - Minimize data size
  //   - Reorder/flat data
  //   - If parsed returns `null`, it will not be recorded into results
  //   - If parsed has a `values` on its root, it will moved to a different file
  //   - If parsed has a `sections` array on it, each element's `values` will be moved to a different file
  //   - If the data may have `errors`, parse them with `parseErrors` argument (see examples)
  //   - If the data is time based (preferably), add a `range` array with first and last date values
  //   - If you need to parse complex data (for example: HTML complex data), take a look at `MenuHelpers.js` and follow example
  //

  // Pre
  {
    query: `0#0|o|`,
    force: true, // Don't use cached data
    validate: (parsed) => parsed?.config && true,
    parse: (data) => {
      // Do nothing, return nothing
      // Not even possible data errors
      return null;
    },
  },

  // Initialize
  {
    query: `1#0|m|${Queries.init}`,
    force: true, // Don't use cached data
    validate: (parsed) => parsed?.values && true,
    parse: (data, parseErrors) => {
      // Parse possible errors, return nothing
      // Possible wanted static data:
      // - Municipis
      // - Províncies
      // - Paisos
      // - ...
      parseErrors('Initialization', data.errors);

      // Log to visually find valuable data
      //console.dir(data,{depth: null});

      // Save in a global to allow other requests to use it's date
      Globals.menu = parseMenu( data.values.sidebarMenuLeft.html );
      Globals.paisos = parseOptions( data.values.inputSeleccioIND_MOB_VIS_PAI.html );
      Globals.provincies = parseOptions( data.values.inputSeleccioIND_MOB_VIS_PRO.html );
      Globals.municipis = parseOptions( data.values.inputSeleccioIND_MOB_VIS_MUN.html );

      return {
        code: 'menu',
        type: 'menu',
        ...Globals,
      };
    },
  },

  // Historical Events
  {
    query: `2#0|m|${Queries.timeline}`,
    validate: (parsed) => parsed?.values && true,
    parse: (data, parseErrors) => {

      // Parse possible errors
      parseErrors('Timeline', data.errors);

      // Log to visually find valuable data
      //console.dir(data,{depth: null});

      // Transform data shape
      return {
        code: 'timeline',
        title: data.values.txtTitolTimeline,
        type: 'timeline',
        range: [ // Date range
          data.values.timelineNoticies.x.items[0].start,
          data.values.timelineNoticies.x.items[
            data.values.timelineNoticies.x.items.length - 1
          ].start,
        ],
        values: data.values.timelineNoticies.x.items
          .map(({start: date, title, content}) => ({
            date,
            title,
            // Parse HTML table with only one useful string value in it
            // Gets content from a <td> tag without any tag inside, multilined
            tag: content.replace(/[\s\S]*<td>([^<]*)<\/td>[\s\S]*$/m, '$1'),
          })),
      };
    },
  },

  // Mobility
  graphRequestFactory('Mobility', 'mobilitatVehicles', `3#0|m|${Queries.mobility}`),

  // Consums
  graphRequestFactory('Consum', 'consums', `4#0|m|${Queries.consums}`),

  // Preus
  graphRequestFactory('Preus', 'preus', `5#0|m|${Queries.preus}`),

  // Visitants: Select all values from all charts before asking for the charts themselves
  {
    query: () => `6#0|m|${JSON.stringify({
      method: "update",
      data:{
        selectMunicipis: Globals.municipis.map(m => m.code),
        selectProvincies: Globals.provincies.map(m => m.code),
        selectPaisos: Globals.paisos.map(m => m.code),
      }
    })}`,
    force: true,
    validate: (parsed) => parsed?.busy === 'idle' && true,
    parse: (data, parseErrors) => {

      // Log to visually find valuable data
      //console.dir(data, {depth: null});

      // Return nothing: only selecting next request' options
      return null;
    },
  },

  // Visitants
  graphRequestFactory('Visitants', 'mobilitatOrigens', `7#0|m|${Queries.mobilitatOrigens}`),

  // Port & Aeroport
  graphRequestFactory('Port & Aeroport', 'portAeroport', `8#0|m|${Queries.portAeroport}`),

];

export default RequestsList;
