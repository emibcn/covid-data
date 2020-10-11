// AbortController polyfill is needed for Node and Chrome GoogleBot
import { AbortController, abortableFetch } from 'abortcontroller-polyfill/dist/cjs-ponyfill.js';

// This is only needed for Node
import _fetch from 'cross-fetch';
const { fetch } = abortableFetch(_fetch);

// Socket: Simulate socketjs xhr-stream client, much simpler, fully async/await,
// with iterator generator over fetch' body response chunks to responses

// From: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#Processing_a_text_file_line_by_line

// Initiates a stream fetch and generates an iterator over its
// response body stream, transforming partial chunks into full lines
async function* makeTextFetchLineIterator(fileURL, options) {
  const utf8Decoder = new TextDecoder('utf-8');
  const response = await fetch(fileURL, options);
  console.log("Response:",response);
  const reader = response.body;

  const re = /\n|\r|\r\n/gm;

  let remaining = '';
  for await (const bytes of reader) {
    const chunk = remaining + (bytes ? utf8Decoder.decode(bytes) : '');
    console.log("Chunk received");
    let startIndex = 0;
    let result;
    while(result = re.exec(chunk)) {
      const next = chunk.substring(startIndex, result.index);
      if (reader.done && (
            re.lastIndex === chunk.length - 1 || // No more chars
            result[0] === '\n'                   // Only '\n' remaining
      )) {
        return next;
      }
      else {
        yield next;
      }
      startIndex = re.lastIndex;
    }
    remaining = chunk.substr(startIndex);
    startIndex = re.lastIndex = 0;
  }
  if (remaining.length) {
    // Last line didn't end in a newline char
    return remaining;
  }
}

// Generates random string
const getRandomStr = (length) => [...Array(length)].map(() => Math.random().toString(36)[2]).join('');

class Socket {

  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.generateConnectionString();
  }

  generateConnectionString() {
    // Generate connection URL prefix
    const random = getRandomStr(19);
    const server = getRandomStr(8);
    const session = Math.floor(Math.random() * 10000 + 1);
    const prefix = `${this.baseUrl}/n=${random}/${session}/${server}`;

    // Save connection URLs
    this.urlStreaming = `${prefix}/xhr_streaming`;
    this.url = `${prefix}/xhr_send`;
  }

  // (Re)Starts a streaming XHR connection to the server
  connect = () => {
    const doneOld = this.done;
    this.done = (async () => {

      // Use AbortController to allow aborting the long polling connection
      this.controller = new AbortController();
     
      // Parse the long polling connection as an iterable,
      // which already parses the incoming chunks into lines
      this.iterable = makeTextFetchLineIterator(this.urlStreaming, {
        method: 'POST',
        signal: this.controller.signal,
        headers: {
          'Connection': 'keep-alive',
        },
      });
     
      // Initial connect needs 'o'
      // Reconnections don't
      const testConnected = doneOld === undefined
        ? value => value === 'o'
        : value => /^h{2,}$/.test(value);

      for(;;) {
        const line = await this.iterable.next();
        console.log("Connect: Received line: ", line);
        if (testConnected(line.value)) {
          console.log("Connect: Received start!");
          this.done = false;
          return;
        }
        if (line.done) {
          throw new Error("Connect: Backend disconnected");
        }
      }
    })();

    console.log("Connect: Assign Promise to done:", {old: doneOld, new: this.done});

    return this.done;
  }

  // Consume messages in iterator, under demmand
  consume = async (validate) => {

    console.log("Consume: called");

    // Wait for new line or end of transmission
    const {done, value} = await this.iterable.next();
    if (this.done !== done) {
      console.log("Consume: Done changed:", {old: this.done, new: done});
      this.done = done;
      if (done === true) {
        throw new Error('Backend disconnected');
      }
    }

    console.log("Consume: Received:",{
      done,
      value: value?.substring(0,80),
    });

    // Parse "a[...]"
    const reUnArray = /^a(\[.*\])$/;
    const resultUnArray = reUnArray.exec(value);

    // If found, look for Array of data
    if (resultUnArray?.length) {
      // Parse multiple data in a single message array
      const [,dataArrayStr] = resultUnArray;
      const dataArray = JSON.parse(dataArrayStr);

      // For each data, look for quoted text with a JSON prefixed with some code
      for (const data of dataArray) {
        const re = /^\w+#\w+\|m\|(\{.*\})$/;
        const result = re.exec(data);
       
        // If found, parse the JSON part and return the resulting object
        if (result?.length) {
          console.log("Correct result found in response");
       
          // Original sockjs code evals the string to get the value
          const [,content] = result;
          let parsed;
          try {
            parsed = JSON.parse( content );
          } catch(err) {
            console.warn("Consume: Error parsing JSON: ", {err, content, parsed});
            throw err;
          }
       
          console.log("Message received:", {parsed});
       
          // Test if request' final response validation passes
          if (validate(parsed)) {
            console.log("Final message received");
            return parsed;
          }
          else {
            console.log("Not validated");
          }
        }
        else {
          console.log("Not matched object:",{re,data,result});
        }
      }
    }
    else {
      console.log("Not matched Array:",{reUnArray,resultUnArray,received:{done,value}});
    }

    // Try again with the next received line
    console.log("Transactional message. Wait for the next.");
    return await this.consume(validate);
  }

  // Close the stream connection
  // The `send` fetches are occasional. Should I care about them?
  close = () => this.controller.abort();

  // Send a request
  send = async (payload, validate) => {

    // If the backend has disconnected, re-connect
    if (this.done === true || this.done === undefined) {
      console.log("Consume: Backend disconnected. Reconnect.");
      await this.connect();
    }
    // If backend is already reconnecting, wait for it to end
    else if (typeof this.done === 'Promise') {
      console.log("Consume: Backend reconnecting. Wait for it.");
      await this.done;
    }

    console.log(`Send query: POST ${this.url}: ${JSON.stringify([payload]).substring(0,80)}`);
    await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify([payload]),
    });

    // Handle possible server disconnections
    try {
      return await this.consume(validate);
    } catch(err) {
      console.log("Send: Error consuming:", err);
      await this.connect();
      return await this.consume(validate);
    }
  }
}

export default Socket;
export {makeTextFetchLineIterator};
