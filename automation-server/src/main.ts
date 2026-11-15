import { connect, MqttClient } from 'mqtt'
import { parseTxt } from './parseTxt'
import { readdirSync } from 'fs'
import EventEmitter from 'events'

const WATCH = Bun.argv[2] === '--watch'
const DRYRUN = Bun.argv[2] === '--dry'

if (WATCH)
  throw new Error('Watch-Mode not yet supported!')

if (!DRYRUN && !import.meta.env.MQTT_URL)
  throw new Error('Missing required MQTT_URL environment variable!')

const client = DRYRUN ? Object.assign(new EventEmitter() as unknown as MqttClient, {
  publish: (topic: string, msg: string | Buffer) => console.log(`(dryrun): Publish to topic "${topic}" data:`, msg),
  subscribe: (topic: string) => console.log(`(dryrun): Subscribe to topic "${topic}"`),
  unsubscribe: (topic: string) => console.log(`(dryrun): Unsubscribe from topic "${topic}"`),
  // on: (event: string, callback: (topic: string, message: string) => void) => {
  //   console.log(`(dryrun): On "${event}"`)
  //   if (event === 'connect')
  //     callback('', '')
  // },
  end: () => {
    console.log(`(dryrun): MQTT end called`)
  }
}) : connect(import.meta.env.MQTT_URL!, {
  username: import.meta.env.MQTT_USER || undefined,
  password: import.meta.env.MQTT_PASS || undefined,
})

if (DRYRUN)
  Bun.sleep(1000).then(() => client.emit('connect', null as any))

const AUTOMATION_DIR = './automations'

const files = readdirSync(AUTOMATION_DIR)

const queue: Map<string, string> = new Map()
let redundantPublishes: number = 0
let needDeviceReload = false

client.on('message', (topic, data) => {
  if (!topic.includes('/automations/add'))
    return

  const next = queue.get(topic)
  if (next === data.toString()) {
    redundantPublishes++
    queue.delete(topic)
  }
  else if (!next) {
    needDeviceReload = true
    client.publish(topic, '', { retain: true })
  }
  else {
    needDeviceReload = true
  }
})

client.on('connect', async () => {
  for (const file of files) {
    const { target, sources, conditions, actions } = parseTxt(AUTOMATION_DIR + '/' + file)

    queue.clear()
    redundantPublishes = 0
    for (const entry of sources)
      queue.set(`${target}/automations/add/source/${entry.id}`, JSON.stringify(entry))
    for (const entry of conditions)
      queue.set(`${target}/automations/add/condition/${entry.id}`, JSON.stringify(entry))
    for (const entry of actions)
      queue.set(`${target}/automations/add/action/${entry.id}`, JSON.stringify(entry))

    client.subscribe(`${target}/automations/add/#`)
    console.log('Waiting 5 seconds to give all subscriptions a chance...')
    await Bun.sleep(5000)
    client.unsubscribe(`${target}/automations/add/#`)

    if (queue.size !== redundantPublishes) {
      for (const [topic, msg] of queue.entries()) {
        client.publish(topic, msg, { retain: true })
      }
    }

    if (needDeviceReload) {
      needDeviceReload = false
      client.publish(`${target}/automations/reload`, '')
    }
  }

  client.end()
})