/**********************************
   Helper functions
*/
// Gets a part beginning with `<h4>` + text and ending with a `\n</div>\n\n`
// Used for getting seguiment and situació blocks
const get_part = (data, text) => {
  const search = new RegExp(
    `[\\s\\S]*?<h4>(${text} [\\s\\S]*?)\n</div>\n\n[\\s\\S]*`,
    "m",
  );
  const part = data.replace(search, "$1");
  return part;
};

// Gets the title from a block extracted from `get_part`
const parse_title = (data) => {
  return data.replace(/([^<]*)<[\s\S]*/m, "$1");
};

// Gets the content of an HTML tag
const get_tag_content = (data, tag) => {
  const search = new RegExp(
    `[\\s\\S]*?<${tag}[^>]*>([\\s\\S]*?)</${tag}>[\\s\\S]*`,
    "m",
  );
  const part = data.replace(search, "$1");
  return part;
};

// Parses a number from dadescovid.cat, which are as 1.234.567,89
const parseNumber = (str) => {
  const num = str.replace(/\./g, "").replace(/,/g, ".");
  return parseFloat(num);
};

/**********************************
   Header blocks
*/
/*
   Seguiment epidemiològic
*/
const get_seguiment = (data) => get_part(data, "Seguiment");

// Parse table headers
const parse_seguiment_headers = (data) => {
  const result = get_tag_content(data, "thead")
    // Normalize `title` attr to always use double quotes
    .replace(/title='([^']*)'/g, 'title="$1"')
    // Remove newlines and extra spaces
    .replace(/\n\s*</g, "<")
    .replace(/\n\s*([^<])/g, " $1")
    .replace(/>\s*/g, ">")
    // Parse <th> elements, saving `title` attr value and tag content
    .matchAll(/<th(?:| .*? title="([^"]*)")>([^<]*)<\/th>/g);
  return Array.from(result, ([match, title, content]) => ({
    ...(title ? { title } : {}),
    content,
  }));
};

// Parse table body
const parse_seguiment_body = (data) => {
  const result = get_tag_content(
    // Data is corrupted: closing tbody misses the '/'
    // Fix it.
    data.replace(/<tbody>(?:\n\s*<\/table>)/m, "</tbody>"),
    "tbody",
  )
    // Normalize `title` attr to always use double quotes
    .replace(/title='([^']*)'/g, 'title="$1"')
    // Normalize th to td
    .replace(/<(\/?)t[hd]/g, "<$1td")
    // Remove leading strong `*`
    .replace(/<strong>\*<\/strong>/g, "")
    // Move span' content outside (and remove span tag)
    .replace(/<span[^>]*>([^<]*)<\/span>/g, "$1")
    // Remove newlines and extra spaces
    .replace(/\n\s*</g, "<")
    .replace(/\n\s*([^<])/g, " $1")
    .replace(/>\s*/g, ">")
    // Parse <tr> elements, saving tag content
    .matchAll(/<tr[^>]*>(.*?)<\/tr>/g);
  return Array.from(result, ([match, content]) => {
    // Parse <td> elements, saving `title` attr value and tag content
    const res = content.matchAll(/<td(?:| .*? title="([^"]*)")>([^<]*)<\/td>/g);
    return Array.from(res, ([match, title, content]) => ({
      ...(title ? { title } : {}),
      // If content is not empty and has not spaces (sic...), parse as number
      content:
        content === "" || content.indexOf(" ") !== -1
          ? content
          : parseNumber(content),
    }));
  });
};

// Global seguiment parser
const parse_seguiment = (data) => {
  return {
    name: parse_title(data),
    headers: parse_seguiment_headers(data),
    body: parse_seguiment_body(data),
  };
};

/*
   Situació diària
*/
const get_situacio = (data) => get_part(data, "Situació");

// Parses a title, which has an ul/li HTML list
const parse_situacio_title = (data) => {
  const result = data.matchAll(/<li>(.*?): (.*?)<\/li>/g);
  return Array.from(result, ([match, name, value]) => ({
    name,
    value: parseNumber(value),
  }));
};

const parse_situacio_elements = (data) => {
  const result = data
    // Move span' content outside (and remove span tag)
    .replace(/<span[^>]*>([^<]*)<\/span>/g, "$1")
    // Same for th and td elements
    .replace(/<t[hd][^>]*>([^<]*)<\/t[hd]>/g, "$1")
    // Same for tr elements
    .replace(/<tr[^>]*>([^<]*)<\/tr>/g, "$1")
    // Remove newlines and extra spaces
    .replace(/\n\s*</g, "<")
    .replace(/\n\s*([^<])/g, " $1")
    .replace(/>\s*/g, ">")
    // Parse <table> elements, saving `title` attr value, thead child content and tbody child content
    .matchAll(
      /<table .*?(?:| title="([^"]*)")><thead[^>]*>(.*?)<\/thead><tbody>(.*?)<\/tbody><\/table>/g,
    );
  return Array.from(result, ([match, title, name, value]) => ({
    // If title exists, parse as ul/li HTML list
    ...(title ? { detail: parse_situacio_title(title) } : {}),
    name: name.trim(),
    value: parseNumber(value.trim()),
  }));
};

// Global situacio parser
const parse_situacio = (data) => {
  return {
    name: parse_title(data),
    elements: parse_situacio_elements(data),
  };
};

/**********************************
   JS Charts
*/
const get_chart_parts = (data) => {
  // Parse some JS code to get ChartJS options
  const result = data.matchAll(
    /var ctx [^']*'([^']*)'[\s\S]*? new Chart\(ctx, ([\s\S]*?)\);[\s\S]*?var restaurar_button/gm,
  );
  return Array.from(result, ([match, name, content]) => {
    return { name, content };
  }).reduce((charts, current) => {
    // Transform array with ieach chart's name and content into an object like `name: content`
    charts[current.name] = parse_chart_data(current.content);
    return charts;
  }, {});
};

// Transform JS object string (something like `{key: 'value', key2: 2.34}`) into an actual JS object
const js_script_to_object = (data) => eval(`(${data})`);

// Removes unused data from collected chart data
const clear_chart_data = (chart) => {
  delete chart.type;

  // Save title from options and delete the rest
  chart.title = chart.options.title.text;
  delete chart.options;

  // Get each dataset data and label, and save as data (overwriting the remaining `data` part)
  chart.data = chart.data.datasets
    .map((d) => {
      const { data, label } = d;
      return { data, label };
    })
    // From this list, remove constant data for low, medium and high (green, yellow and red) lines
    .filter((d) => !["Baix", "Moderat", "Alt"].includes(d.label));

  return chart;
};

// Parses chart data
const parse_chart_data = (data) => {
  return clear_chart_data(
    js_script_to_object(
      data
        // Remove newlines ans extra spaces
        .replace(/\n\s*/g, "")
        // Remove everything after and including `tooltips` (which includes a JS function we don't want to parse)
        .replace(/,tooltips: .*/, "}}"),
    ),
  );
};

/**********************************
   Global data parsing
*/
const getData = (data) => {
  const charts = get_chart_parts(data);
  return {
    seguiment: parse_seguiment(get_seguiment(data)),
    situacio: parse_situacio(get_situacio(data)),
    ...charts,
  };
};

export default getData;
