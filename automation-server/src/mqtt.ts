import { connect, MqttClient } from 'mqtt'
import EventEmitter from 'events'
import { DRYRUN } from './flags'

if (!DRYRUN && !import.meta.env.MQTT_URL)
  throw new Error('Missing required MQTT_URL environment variable!')

const client = DRYRUN ? Object.assign(new EventEmitter() as unknown as MqttClient, {
  publish: (topic: string, msg: string | Buffer) => console.log(`(dryrun): Publish to topic "${topic}" data:`, msg),
  subscribe: (topic: string) => console.log(`(dryrun): Subscribe to topic "${topic}"`),
  unsubscribe: (topic: string) => console.log(`(dryrun): Unsubscribe from topic "${topic}"`),
  end: () => {
    console.log(`(dryrun): MQTT end called`)
  }
}) : connect(import.meta.env.MQTT_URL!, {
  username: import.meta.env.MQTT_USER || undefined,
  password: import.meta.env.MQTT_PASS || undefined,
})

if (DRYRUN)
  setTimeout(() => client.emit('connect', null as any), 100)

const subscriptions = new Map<RegExp, (msg: string, topic: string) => void | number | null | Promise<void | number | null>>()

export const connected: Promise<void> = new Promise(resolve => {
  client.on('connect', () => {
    resolve()
  })
})

client.on('message', (topic, msg) => {
  for (const [regex, func] of subscriptions.entries()) {
    if (regex.test(topic))
      func(msg.toString(), topic)
  }
})

export function clearRetain(topic: string) {
  return publish(topic, '', true)
}

export function publish(topic: string, message: string = '', retain: boolean = false) {
  return client.publish(topic, message, { retain })
}

export async function subscribe(topic: string, listener?: typeof subscriptions extends Map<any, infer V> ? V : never, initialTimeout?: number) {
  if (listener) {
    if (DRYRUN && initialTimeout !== undefined)
      return console.log(`(dryrun): MQTT Subscribe to topic "${topic}" with an initial Timeout of ${initialTimeout}ms (skipping wait time due to dryrun)`)

    return new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null
      const regex = new RegExp(`^${topic.replace(/\+/g, '[^/]+').replace(/#/g, '.*')}$`)
      function done() {
        client.unsubscribe(topic)
        subscriptions.delete(regex)
        resolve()
      }
      subscriptions.set(regex, async (msg, tpc) => {
        if (timer !== null) {
          clearTimeout(timer)
          timer = null
        }
        const res = await listener(msg, tpc)
        if (res === null)
          done()
        else if (typeof res === 'number')
          timer = setTimeout(() => done(), res)
      })
      if (initialTimeout !== undefined) {
        timer = setTimeout(() => done(), initialTimeout)
      }
      client.subscribe(topic)
    })
  }
  else {
    return client.subscribe(topic)
  }
}

export function unsubscribe(topic: string) {
  return client.unsubscribe(topic)
}

export function disconnect() {
  return client.end()
}