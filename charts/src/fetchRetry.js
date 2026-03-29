// Use Node fetch
import fetch from "cross-fetch";

// Promise based setTimeout (async/await compatible)
const wait = (millis) => new Promise((resolve) => setTimeout(resolve, millis));

// Raises exception on response error
const handleFetchErrors = (response) => {
  // Raise succeeded non-ok responses
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return response;
};

// Fetch an endpoint, retrying `retries` times before giving up
// Wait random periods between tries
const fetchRetry = async (
  url,
  {
    retries = 20,
    retryMinWait = 10_000,
    retryMarginWait = 10_000,
    ...options
  } = {},
) => {
  try {
    const response = await fetch(url, options);
    handleFetchErrors(response);
    return response;
  } catch (err) {
    const nextRetries = retries - 1;

    // No more retries left
    if (nextRetries === 0) {
      console.error(`Error: '${url}': No more retries left.`);
      throw err;
    }

    // Wait randomly between 10 and 20 seconds
    const millis = Math.floor(Math.random() * retryMarginWait + retryMinWait);
    console.warn(
      `Warning '${url}' failed (${nextRetries} retries left, wait ${
        millis / 1_000
      }): ${err.name}: ${err.message}`,
    );
    await wait(millis);

    // Retry download
    console.log(`Retry ${nextRetries} '${url}'...`);
    return await fetchRetry(url, {
      ...options,
      retries: nextRetries,
      retryMinWait,
      retryMarginWait,
    });
  }
};

export default fetchRetry;
export { wait, handleFetchErrors };
