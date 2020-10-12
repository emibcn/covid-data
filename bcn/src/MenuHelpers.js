// Parsers helpers
import { Parser } from 'htmlparser2';
import { DomHandler } from 'domhandler';

// Get all text contents, recursively
const getAllText = (node) => {
  return node.children.map( n => {
    if (n.type === 'text') {
      return n.data.trim("\n\r ");
    }

    // Discard `small` tags
    if (n.name === 'small') {
      return ''
    }

    return getAllText(n);
  }).join('')
}

const parseLink = (link) => {
  const name = getAllText(link);
  const code = link.attribs['data-value']?.trim("\n\r ");
  return {
    name,
    ...(code ? {code} : {}),
  }
}

const parseLi = (li) => {
  const ul = li.children.find(({type, name}) => type === 'tag' && name === 'ul' );
  const link = li.children.find(({type, name}) => type === 'tag' && name === 'a' );
  return {
    ...(link ? parseLink(link) : {}),
    ...(ul ? {children:  parseUl(ul)} : {}),
  }
}

const parseUl = (ul) => {
  return ul.children.filter(({type, name}) => type === 'tag' && name === 'li' ).map( child => {
    return parseLi(child);
  });
}

// Parses HTML data containing a UL/LI/A tree
const parseMenu = (data) => {
  let result;
  const handler = new DomHandler( (error, dom) => {
    if (error) {
      // Handle error
    } else {
      // Parsing completed, do something
      result = parseUl(dom[0]);
    }
  });
  const parser = new Parser(handler);
  parser.write(data);
  parser.end();
  return result;
}

// Find an element in the menu tree, recursively
const findMenu = (code, list) => {

  // Try in first level children
  const found = list.find( node => node.code === code);
  if ( found ) {
    return found
  }

  // Find in children's children
  for (const node of list.filter( node => node.children)) {
    try {
      return findMenu(code, node.children);
    } catch(err) {
      // Don't care. Only relevant on initial call
    }
  }

  throw new Error(`Menu item not found: '${code}'`);
}

export {findMenu, parseMenu};
