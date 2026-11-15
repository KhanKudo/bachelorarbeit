import { fetch } from "bun";

if (!import.meta.env.HA_TOKEN)
  throw new Error('Missing required HA_TOKEN environment variable!')

// console.log(JSON.parse('[' + (await (await fetch('https://bachelor.milenkovic.cloud/api/template', {
//   method: 'POST',
//   headers: {
//     'Authorization': `Bearer ${import.meta.env.HA_TOKEN}`
//   },
//   body: `{"template":"{{ device_attr('switch.bedroom_tester_beta', 'identifiers') }}"}`,
// })).text()).slice(2, -2).replaceAll("'", '"') + ']'))

console.log((await (await fetch('https://bachelor.milenkovic.cloud/api/template', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${import.meta.env.HA_TOKEN}`
  },
  body: `{"template":"{{ device_attr('switch.bedroom_tester_beta', 'identifiers') }}"}`,
})).text()).match(/^{\('mqtt', '([^']+)'\)}$/)?.[1])