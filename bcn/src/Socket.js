// AbortController polyfill is needed for Node and Chrome GoogleBot
import { AbortController } from 'abortcontroller-polyfill/dist/cjs-ponyfill.js';

// This is only needed for Node
import fetch from 'cross-fetch';

// Socket: Simulate socketjs xhr-stream client, much simpler, fully async/await,
// with iterator generator over fetch' body response chunks to responses

// From: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#Processing_a_text_file_line_by_line

// Initiates a stream fetch and generates an iterator over its
// response body stream, transforming partial chunks into full lines
async function* makeTextFetchLineIterator(fileURL, options) {
  const utf8Decoder = new TextDecoder('utf-8');
  const response = await fetch(fileURL, options)
    .catch(err => console.log("Iterator: Fetch: Error:", err));
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
        // If `yield` returns something, it's a user parameter passed through `next`
        // We use it to cleanly close the stream when called as `next(true)`
        const close = yield next;
        if (close) {
          reader.end();
          reader.destroy();
          throw new Error("Generator: aborted");
        }
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

  // Used to abort ongoing connections
  controller = new AbortController();

  // Forced requests will be treated as initial ones
  initialRequests = [];

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
  connect = async () => {
    const doneOld = this.done;
    this.done = (async () => {

      // Use AbortController to allow aborting the long polling connection
      this.controller.signal.onabort = (event) => {
        console.log("Socket: Connect: Aborted!", event);
        return true
      }
     
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
        console.log("Connect: Wait for next line");
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

  // Close the stream connection
  close = async () => {
    console.log(`Socket: Abort pending connections`);

    // Once used, create a new AbortController
    this.controller.abort();
    this.controller = new AbortController();

    console.log("Consume remaining iterable and ask to close.");

    try {
      await this.iterable.next(true);
    } catch(err) { }

    this.done = undefined;

    console.log("Socket: All done closing.");
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

      // Parse "c[...]"
      const reUnException = /^c(\[.*\])$/;
      const resultUnException = reUnException.exec(value);

      // Connection was completely restarted
      // We need to send the initial requests
      if (value === 'o') {
        console.log(`Complete connection restart detected. Sending initial commands (${this.initialRequests.length})...`);
        await this.sendInitialRequests();
        return false;
      }
      // There was an error sent from server
      else if (resultUnException?.length) {
        const [,dataArrayStr] = resultUnException;
        const dataArray = JSON.parse(dataArrayStr);
        const [code, error] = dataArray;

        console.warn(`Detected error from server: ${code} - ${error}`);

        // Unable to open connection
        if (code === 4705) {
          // We need a complete new connection
          console.log(`Complete connection restart forced.`);
          await this.close();
          this.generateConnectionString();
          await this.connect();

          return false;
        }
        // Unable to open connection
        else {
          throw new Error(`Connection error: ${code} - ${error}`);
        }
      }
    }

    // Try again with the next received line
    console.log("Transactional message. Wait for the next.");
    return await this.consume(validate);
  }

  connectRetry = async (count=3) => {
    // Try to connect 3 times
    // Re-throw the error on the last
    try {
      await this.connect();
    } catch(err) {

      // Re-throw
      if (i === 0) {
        throw err
      }

      // Re-try
      await this.connectRetry(count-1);
    }
  }

  ensureConnection = async () => {
    // If the backend has disconnected, re-connect
    if (this.done === true || this.done === undefined) {
      console.log("Consume: Backend disconnected. Reconnect.");
      await this.connectRetry();
    }

    // If backend is already reconnecting, wait for it to end
    else if (typeof this.done === 'Promise') {
      console.log("Consume: Backend reconnecting. Wait for it.");
      await this.done;
    }

  }

  sendInitialRequests = async () => {
    for (const request of this.initialRequests) {
      const {payload, validate} = request;
      await this.send(payload, validate);
    }
  }

  // Send a request
  send = async (payload, validate, initial) => {

    // Ensure we have socket connected
    await this.ensureConnection();

    // Save initial requests into a specialized array
    if (initial) {
      this.initialRequests.push({payload, validate});
    }

    console.log(`Send query: POST ${this.url}: ${JSON.stringify([payload]).substring(0,80)}`);
    await fetch(this.url, {
      method: 'POST',
      signal: this.controller.signal,
      headers: {
        'Content-Type': 'text/plain',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify([payload]),
    });

    // Handle possible server disconnections
    var result;
    try {

      result = await this.consume(validate);

    } catch(err) {

      console.log("Send: Error consuming:", err);
      await this.connect();
      result = await this.consume(validate);

    }

    // If result is exactly `false`, we need to resend the query
    if (result === false) {
      return await this.send(payload, validate, initial);
    }

    return result;
  }
}

export default Socket;
export {makeTextFetchLineIterator};
