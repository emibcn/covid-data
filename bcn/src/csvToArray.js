const csvToArray = (data) => {
  // Split data into lines and separate headers from actual data
  // using Array spread operator
  const [headerLine, ...lines] = data.split("\n");

  // Use common line separator, which parses each line as the contents of a JSON array
  const parseLine = (line) => JSON.parse(`[${line}]`);

  // Split headers line into an array
  const headers = parseLine(headerLine);

  // Create objects from parsing lines
  // There will be as much objects as lines
  const objects = lines.map((line, index) =>
    // Split line with JSON
    parseLine(line)
      // Reduce values array into an object like: { [header]: value }
      .reduce(
        (object, value, index) => ({
          ...object,
          [headers[index]]: value,
        }),
        {},
      ),
  );

  return objects;
};

export default csvToArray;
