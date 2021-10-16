import parseStatic from './parseStatic.js'
import parseChart from './parseChart.js'

// Parses all the data from a page into a single JSON object
const parse = (data, processStatic = true) => {
  return {
    ...(processStatic ? { staticData: parseStatic(data) } : {}),
    chartData: parseChart(data)
  }
}

export default parse
