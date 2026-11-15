import { fetch } from "bun"
import { readFileSync } from "fs"

if (!import.meta.env.HA_URL)
  throw new Error('Missing required HA_URL environment variable!')
if (!import.meta.env.HA_TOKEN)
  throw new Error('Missing required HA_TOKEN environment variable!')

const URL = import.meta.env.HA_URL

async function entityToSource(entityId: string): Source {
  const devId = (await (await fetch(URL + '/api/template', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.HA_TOKEN}`
    },
    body: `{"template":"{{ device_attr('${entityId}', 'identifiers') }}"}`,
  })).text()).match(/^{\('mqtt', '([^']+)'\)}$/)?.[1]


}

export function parseHomeAssistant() {
  const automations = Bun.YAML.parse(readFileSync('automations.yaml'))
}

if (import.meta.main) {
  parseHomeAssistant()
}