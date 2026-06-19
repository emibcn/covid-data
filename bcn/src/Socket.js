// AbortController polyfill is needed for Node and Chrome GoogleBot
import { AbortController } from "abortcontroller-polyfill/dist/cjs-ponyfill.js";

// This is only needed for Node
import fetch from "cross-fetch";

// Socket: Simulate socketjs xhr-stream client, much simpler, fully async/await,
// with iterator generator over fetch' body response chunks to responses

// From: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#Processing_a_text_file_line_by_line

// Initiates a stream fetch and generates an iterator over its
// response body stream, transforming partial chunks into full lines
async function* makeTextFetchLineIterator(fileURL, options) {
  const utf8Decoder = new TextDecoder("utf-8");
  const response = await fetch(fileURL, options).catch((err) => {
    console.log("Fetch Iterator: Fetch: Error:", err);
    throw err;
  });
  console.log("Response:", response);
  const reader = response.body;

  const re = /\n|\r|\r\n/gm;

  let remaining = "";
  for await (const bytes of reader) {
    const chunk = remaining + (bytes ? utf8Decoder.decode(bytes) : "");
    console.log("Chunk received");
    let startIndex = 0;
    let result;

    while ((result = re.exec(chunk))) {
      const next = chunk.substring(startIndex, result.index);

      // If stream end is detected
      if (
        reader.done &&
        (re.lastIndex === chunk.length - 1 || // No more chars
          result[0] === "\n") // Only '\n' remaining
      ) {
        return next;
      } else {
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

    // Save remaining (not consumed) data
    remaining = chunk.substr(startIndex);

    // Restart newlines Regexp parser
    startIndex = re.lastIndex = 0;
  }

  // Last line didn't end in a newline char
  if (remaining.length) {
    return remaining;
  }
}

// Generates random string
const getRandomStr = (length) =>
  [...Array(length)].map(() => Math.random().toString(36)[2]).join("");

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
        return true;
      };

      // Parse the long polling connection as an iterable,
      // which already parses the incoming chunks into lines
      this.iterable = makeTextFetchLineIterator(this.urlStreaming, {
        method: "POST",
        signal: this.controller.signal,
        headers: {
          Connection: "keep-alive",
        },
      });

      // Initial connect needs 'o'
      // Reconnections don't
      const testConnected =
        doneOld === undefined
          ? (value) => value === "o"
          : (value) => /^h{2,}$/.test(value);

      for (;;) {
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

    console.log("Connect: Assign Promise to done:", {
      old: doneOld,
      new: this.done,
    });

    return this.done;
  };

  // Close the stream connection
  close = async () => {
    console.log("Socket: Abort pending connections");

    // Once used, create a new AbortController
    this.controller.abort();
    this.controller = new AbortController();

    console.log("Consume remaining iterable and ask to close.");
    try {
      await this.iterable.next(true);
    } catch (err) {}

    this.done = undefined;

    console.log("Socket: All done closing.");
  };

  // Parses a message raw response
  // Before parsing, tests is message is applicable to parsing message kind
  // If applies, will returns JSON.parse results, or throws error on JSON parse error
  parseMessageStr = (value, regexp) => {
    // Parse "a[...]" or "c[...]" or "4F#0|m|{...}"
    const result = regexp.exec(value);

    // If found, look for Array of data
    if (result?.length) {
      // Parse multiple data in a possible single message array
      const [, dataStr] = result;

      try {
        return JSON.parse(dataStr);
      } catch (err) {
        console.warn("Consume: Error parsing JSON: ", { err, dataStr, result });
        throw err;
      }
    }

    return false;
  };

  // Parses an error message received by consume
  // If possible, tries to solve the situation
  // If not possible, throws fatal error
  parseConsumeError = async (value) => {
    // Connection was completely restarted
    // We need to send the initial requests
    if (value === "o") {
      console.log(
        `Complete connection restart detected. Sending initial commands (${this.initialRequests.length})...`,
      );
      await this.sendInitialRequests();
      return false;
    }

    // Parse "c[...]"
    const dataArray = this.parseMessageStr(value, /^c(\[.*\])$/);

    // There was an error sent from server
    if (dataArray !== false) {
      const [code, error] = dataArray;

      console.warn(`Detected error from server: ${code} - ${error}`);

      // Unable to open connection
      if (code === 4705) {
        // We need a complete new connection
        console.log("Complete connection restart forced.");
        await this.close();
        this.generateConnectionString();
        await this.connect();

        return false;
      }
      // Unhandled connection error
      else {
        throw new Error(`Connection FATAL error: ${code} - ${error}`);
      }
    } else {
      const dataObject = this.parseMessageStr(
        value,
        /^[0-9A-F]*#[0-9A-F]*\|c\|({.*})$/,
      );
      if (dataObject !== false) {
        const { code, reason } = dataObject;
        console.error(`Error received from server: ${code} - ${reason}`);
        throw new Error(`Connection FATAL error: ${code} - ${reason}`);
      } else {
        // We need a complete new connection
        console.log("Complete connection restart forced.");
      }
    }

    // We can continue consuming normally
    return true;
  };

  // Tries to parse a consume raw response
  // - On success, returns object response
  // - If not array response (keepalive/error), returns false (wait for next or possible error)
  // - If array but without object (ACK) or with a not validated
  //   object (busy, recalculating, recalculated, ...), returns null (wait for next)
  parseConsumeResponse = async (value, validate) => {
    // Parse "a[...]"
    const dataArray = this.parseMessageStr(value, /^a(\[.*\])$/);

    // If found, look for Array of data
    if (dataArray !== false) {
      // For each data, look for quoted text with a JSON prefixed with some code
      for (const data of dataArray) {
        // Original sockjs code evals the string to get the value
        const parsed = this.parseMessageStr(data, /^\w+#\w+\|m\|(\{.*\})$/);

        // If found, parse the JSON part and return the resulting object
        if (parsed !== false) {
          console.log("Correct result found in response. Message received:", {
            parsed,
          });

          // Test if request' final response validation passes
          if (validate(parsed)) {
            console.log("Final message received");
            return parsed;
          } else {
            console.log("Not validated");
          }
        } else {
          console.log("Not matched object:", { data });
          const success = await this.parseConsumeError(data);
          if (!success) {
            return false;
          }
        }
      }
    } else {
      return false;
    }

    return null;
  };

  // Consume messages in iterator, under demmand
  consume = async (validate) => {
    console.log("Consume: called");

    // Wait for new line or end of transmission
    const { done, value } = await this.iterable.next();
    if (this.done !== done) {
      console.log("Consume: Done changed:", { old: this.done, new: done });
      this.done = done;
      if (done === true) {
        throw new Error("Backend disconnected");
      }
    }

    console.log("Consume: Received:", {
      done,
      value: value?.substring(0, 80),
    });

    // Tries to parse and validate a correct message string
    const parsedResponse = await this.parseConsumeResponse(value, validate);

    // If parsed evaluates to true (an object), return valid response
    // Other possible responses are:
    // - null: transactional message: keep trying
    // - false: error detected, try to handle
    // - throw error: Error parsing one of the two JSON strings
    if (parsedResponse) {
      return parsedResponse;
    }

    // If parsed is exactly false, it is an error message
    // Try to handle it or rethrow if couldn't
    else if (parsedResponse === false) {
      console.log("Not matched Array:", { received: { done, value } });

      const parsedError = await this.parseConsumeError(value);

      // Only true is a good result
      // Other results:
      //  - false: Need to resend query
      //  - throw error: Final fatal error: Something is very wrong
      //  - throw error: Error parsing the JSON string
      if (parsedError !== true) {
        return parsedError;
      }
    }

    // Try again with the next received line
    console.log("Transactional message. Wait for the next.");
    return await this.consume(validate);
  };

  // Try to connect 3 times
  // Re-throw the error on the last
  connectRetry = async (count = 3) => {
    try {
      await this.connect();
    } catch (err) {
      // Re-throw
      if (i === 0) {
        throw err;
      }

      // Re-try
      await this.connectRetry(count - 1);
    }
  };

  // Handle when connection is in bad/temporal state
  ensureConnection = async () => {
    // If the backend has disconnected, re-connect
    if (this.done === true || this.done === undefined) {
      console.log("Consume: Backend disconnected. Reconnect.");
      await this.connectRetry();
    }

    // If backend is already reconnecting, wait for it to end
    else if (typeof this.done === "Promise") {
      console.log("Consume: Backend reconnecting. Wait for it.");
      await this.done;
    }
  };

  // Sends to server the requests to correctly initiate the session
  // Used on hard reconnections
  sendInitialRequests = async () => {
    for (const request of this.initialRequests) {
      const { payload, validate } = request;
      await this.send(payload, validate);
    }
  };

  // Send a request
  send = async (payload, validate, initial) => {
    // Ensure we have socket connected
    await this.ensureConnection();

    // Save initial requests into a specialized array
    if (initial) {
      this.initialRequests.push({ payload, validate });
    }

    console.log(
      `Send query: POST ${this.url}: ${JSON.stringify([payload]).substring(
        0,
        80,
      )}`,
    );
    await fetch(this.url, {
      method: "POST",
      signal: this.controller.signal,
      headers: {
        "Content-Type": "text/plain",
        Connection: "keep-alive",
      },
      body: JSON.stringify([payload]),
    });

    // Handle possible server disconnections
    let result;
    try {
      result = await this.consume(validate);
    } catch (err) {
      console.log("Send: Error consuming. Try to do soft reconnection.", err);
      await this.connect();
      result = await this.consume(validate);
    }

    // If result is exactly `false`, we need to resend the query
    if (result === false) {
      return await this.send(payload, validate, initial);
    }

    return result;
  };
}

export default Socket;
export { makeTextFetchLineIterator };
