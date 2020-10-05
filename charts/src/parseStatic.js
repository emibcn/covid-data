// Transforms `<a href="$url">$name</a>` list into objects list
// When `withChildren == true`:
//  - More indented links as treated as child of previous less indented item
//  - All first level links have `children` property, even if empty
//  - All second level links may have `children` property
const parse_links_to_list = (links, withChildren = false) => {
  const result = links
    .map(link => {
      let res;
      link.replace(
        /^([^\<]*)<a [^ ]* href="([^"]*)"[^>]*>([^<]*)\d*<\/a>/,
        (str, spaces, url, name) => {
          res = {
            spaces,
            url,
            name
          }
        }
      );
      return res;
    });

  if ( withChildren ) {
    // Remove `spaces` member from links, recursively
    const clear_link_list_spaces = (list) => {
      return list.map( link => {
        if ( 'spaces' in link ) {
          delete link.spaces;
        }
        if ( !('children' in link) ) {
          return link;
        }
        else {
          return {
            ...link,
            children: clear_link_list_spaces(link.children)
          }
        }
      })
    };

    return clear_link_list_spaces(
      result
        .reduce( (list, current, index, original) => {
          const {url, name, spaces} = current;
          const toPush = {url, name, spaces};
          // Parent nodes
          if ( current.spaces.indexOf('\t') !== -1 ) {
            list.push(toPush);
            list[list.length - 1].children = [];
          }
          else {
            const lastParent = list[list.length - 1];
            const last = lastParent
              .children[ lastParent.children.length - 1 ];
       
            // Intermediate nodes
            if ( !last || current.spaces.length === last.spaces.length) {
              lastParent.children.push(toPush);
            }
            // Child nodes
            else {
              if ( !('children' in last ) ) {
                last.children = [];
              }
              last.children.push(toPush);
            }
          }
          return list;
        }, [])
    )
  }
  else {
    return result
      .map( link => {
        const {url, name} = link;
        return {url, name};
      });
  }
}

// Get all links matching some conditions
const get_all_links = (data) => {
  const result = data
    .matchAll(/[ \t]*<a (?:id="(?:sap_|ambit_|up_)|class="dropdown-item")[^>]*>[^<]*<\/a>/g);
  return Array.from(result, m => m[0])
    // Remove translation links
    .filter(r => r.indexOf("?lang=") === -1)
    // Replace '&amp;' back to '&' (both work, but this is shorter)
    .map(r => r.replace(/&amp;/g, '&'))
}

/*
  Base static data URLs:
  - Població: total
  - Territori: Regió/AGA
  - Initial Data region: Catalunya
*/
const get_static_and_data_urls = (all_links) => {
  return parse_links_to_list(
    all_links.filter(d => d.search(/\?tipus_territori|\?drop_es_residencia/) === -1 ),
    true
  )
}

/*
  Modifier for:
  - Territori: Comarca
*/
const get_modifiers_territoris = (all_links) => {

  // Default value for `territori` (the value on the HOME/initial page)
  const default_territori = 'tipus_territori=aga';

  return parse_links_to_list(
    all_links.filter(d => d.search(/\?tipus_territori/) !== -1 )
  ).map( link =>
    link.url.indexOf( default_territori ) !== -1 ?
      // Add `default` mark
      {...link, default: true} :
      link
  )
}

/*
  Modifiers for:
  - Població: general
  - Població: residència
*/
const get_modifiers_poblacions = (all_links) => {

  // Default value for `territori` (the value on the HOME/initial page)
  const default_poblacio = 'drop_es_residencia=2';

  return parse_links_to_list(
    all_links.filter(d => d.search(/\?drop_es_residencia/) !== -1 )
  ).map( link =>
    link.url.indexOf( default_poblacio ) !== -1 ?
      // Add `default` mark
      {...link, default: true} :
      link
  )
}

// Export collected data as a big JS object
const parseStatic = (data) => {

  const all_links = get_all_links(data);

  return {
    static:     get_static_and_data_urls(all_links),
    territoris: get_modifiers_territoris(all_links),
    poblacions: get_modifiers_poblacions(all_links),
  };
}

export default parseStatic;
