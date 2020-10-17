// This is only needed for Node
import fetch from 'cross-fetch';
import {promises as fs, constants} from 'fs';

// Parsers helpers
import { Parser } from 'htmlparser2';
import { DomHandler } from 'domhandler';

const fileURL = 'https://www.aspb.cat/docs/infobarris/';

// Parses HTML data containing a DIV/UL/LI/A tree
const parseList = (data) => {

  // Get all text contents, recursively
  const getAllText = (node) => {
    return node.children.map( n => {
      if (n.type === 'text') {
        return n.data.trim("\n\r ");
      }
  
      // Discard `small` tags
      if (['small', 'i'].includes(n.name)) {
        return ''
      }
  
      return getAllText(n);
    }).join('')
  }

  const parseLink = (link) => {
    const name = getAllText(link);
    const code = link.attribs['codi'];
    const id = link.attribs['id']
      .replace(/_boto$/, '')
      .replace(/^districte_/, '');
    return {
      name,
      id,
      ...(code ? {code} : {}),
    }
  }

  const parseLi = (li) => {
    const link = li.children.find(({type, name}) => type === 'tag' && name === 'a' );
    return {
      ...(link ? parseLink(link) : {}),
    }
  }

  const parseUl = (ul) => {
    return ul.children.filter(({type, name}) => type === 'tag' && name === 'li' ).map( child => {
      return parseLi(child);
    });
  }

  let result;
  const handler = new DomHandler( (error, dom) => {
    if (error) {
      // Handle error
    } else {
      // Parsing completed, do something
      const div = dom[0];
      const ul = div.children.find(({type, name}) => type === 'tag' && name === 'ul' );
      result = {
        code: div.attribs['class']
          .replace(/^[^ ]* /, '')
          .replace(/^barrios-/, ''),
        list: parseUl(ul),
      }
    }
  });

  const parser = new Parser(handler);
  parser.write(data);
  parser.end();
  return result;
}

// Save a string into a file
const saveFile = async (file, content) => {
  try {
    await fs.writeFile(file, content);
    console.log(`File saved: ${file}`);
  } catch(err) {
    throw new Error(`Saving '${file}' file: ${err.name}: ${err.message}`)
  }
}

// Gets a page, from disk or downloading
const getPage = async ({cache, disableCache}) => {
  const file = `${cache ?? '.'}/barris.html`;

  try {
    if (disableCache) {
      throw new Error("Cache temporarily disabled");
    }

    return await fs.readFile(file, 'utf8');
  } catch (err) {
  
    // TODO: Parse HTTP HEAD `last-modified` before sending actual request
    const response = await fetch(fileURL)
      .catch(err => {
        console.log("Fetch Iterator: Fetch: Error:", err);
        throw err
      });

    console.log("Response:",response);

    const page = await response.text();
    if (cache) {
      await saveFile(file, page);
    }
    return page;
  }
}

// Gets JSON and SVG barrios data
const getBarris = async (options) => {

  // Read or download page content
  const page = await getPage(options);
  
  // Get relevant page parts
  const part = page.replace(/[\s\S]*<li class="nav-item dropdown">([\s\S]*)<\/li>[ \t\r\n]*<\/ul>[ \t\r\n]*<div class="nav-item sn-mobile">[\s\S]*/m, '$1');
  const svg = part.replace(/[\s\S]*(<svg[^>]*>[\s\S]*[\s\S]*<\/svg>)[\s\S]*/m, '$1')
            .replace(/^[ ]{24,24}/gm, '')
            .replace(/\r/gm, '');
  
  // Get all occurrences of a div containing a ul
  // Transform RegExp iterable into array and:
  // - Map each result to the actual match
  // - Map each match with parseList
  const lists =
    Array.from(
      part.matchAll(/(<div class="(?:col-md-4 lista-distritos|barrios-[^ "]*)">[\s\S]*?<ul[^>]*>[\s\S]*?<\/ul>[\s\S]*?<\/div>)/gm)
    )
    .map( ([,match]) => match )
    .map( parseList );
  
  // First list is the list of districts and the rest are the barrios
  const [districtes, ...barris] = lists;
  
  // Reshape data
  const result = 
    barris.map( ({code, list}, index) => ({
      name: districtes.list.find(d => d.id === code).name,
      code: index + 1,
      sections: list.map( ({code, ...rest}) => ({
        code: Number(code),
        ...rest,
      })),
    }));

  return {
    values: result,
    svg,
  };
}

export default getBarris;
