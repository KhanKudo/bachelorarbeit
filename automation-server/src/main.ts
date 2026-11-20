import { parseTxt } from './parseTxt'
import { readdirSync } from 'fs'
import { WATCH } from './flags'
import { publish, disconnect, subscribe, connected, clearRetain } from './mqtt'
import type { Automation } from './core'
import { parseHomeAssistant } from './parseHA'

if (WATCH)
  throw new Error('Watch-Mode not yet supported!')

const AUTOMATION_DIR = './automations'

const files = readdirSync(AUTOMATION_DIR)

await connected

function parseFile(filePath: string): Promise<Automation> {
  if (filePath.endsWith('.txt'))
    return parseTxt(AUTOMATION_DIR + '/' + filePath)
  else if (filePath.endsWith('.yaml'))
    return parseHomeAssistant(AUTOMATION_DIR + '/' + filePath)
  else
    throw new Error(`Could not parse unsupported file type: "${filePath}"`)
}

for (const file of files) {
  console.log(`[ Parsing "${file}" ]`)
  const { target, sources, conditions, actions } = await parseFile(file)

  const queue: Map<string, string> = new Map()
  let needDeviceReload = false

  for (const entry of sources)
    queue.set(`${target}/automations/add/source/${entry.id}`, JSON.stringify(entry))
  for (const entry of conditions)
    queue.set(`${target}/automations/add/condition/${entry.id}`, JSON.stringify(entry))
  for (const entry of actions)
    queue.set(`${target}/automations/add/action/${entry.id}`, JSON.stringify(entry))

  await subscribe(`${target}/automations/add/#`, (data, topic) => {
    const next = queue.get(topic)
    if (next === data.toString()) {
      queue.delete(topic)
    }
    else if (!next) {
      needDeviceReload = true
      clearRetain(topic)
    }
    else {
      needDeviceReload = true
    }

    return 500
  }, 5000)

  if (queue.size === 0 && !needDeviceReload) {
    console.log(`[ Device automations "${file}" already fully up-to-date ]`)
    continue
  }

  if (queue.size) {
    for (const [topic, msg] of queue.entries()) {
      publish(topic, msg, true)
    }
  }

  if (needDeviceReload) {
    needDeviceReload = false
    publish(`${target}/automations/reload`)
  }
}

disconnect()