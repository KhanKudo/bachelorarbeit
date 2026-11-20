import { fetch } from "bun"
import { readFileSync } from "fs"
import { connected, disconnect, subscribe } from "./mqtt"
import { Action, CompType, Condition, createAutomation, GateType, Source, SrcType, type Automation } from "./core"

if (!import.meta.env.HA_URL)
  throw new Error('Missing required HA_URL environment variable!')
if (!import.meta.env.HA_TOKEN)
  throw new Error('Missing required HA_TOKEN environment variable!')

const URL = import.meta.env.HA_URL

type HATarget = {
  entity_id?: string | string[]
}

type HAOptions = {
  behaviour?: 'any' | 'all' // default: any
  for?: string | number // default 00:00:00
}

type HACond = {
  condition: 'state'
  entity_id: string | string[]
  state: string | number | boolean | (string | number | boolean)[]
  attribute?: string
  match?: 'any' | 'all' // default: all
  for?: string | number // default 00:00:00
} | {
  condition: 'numeric_state'
  entity_id: string | string[]
  attribute?: string
  above?: number | string
  below?: number | string
  value_template?: unknown
} | {
  condition: 'switch.is_on' | 'switch.is_off'
  target: HATarget
  options: HAOptions
}

type HATrigger = {
  trigger: 'state'
  entity_id: string | string[]
  from?: string | string[]
  to?: string | string[]
  not_from?: string | string[]
  not_to?: string | string[]
  attribute?: string
  for?: string | number // default 00:00:00
} | {
  trigger: 'numeric_state'
  entity_id: string | string[]
  above?: string
  below?: string
  attribute?: string
  value_template?: unknown
  for?: string | number // default 00:00:00
}

type HAAction = {
  action: 'switch.turn_off' | 'switch.turn_on' | 'switch.toggle'
  target: HATarget
}

interface HAAutomation {
  alias?: string
  id?: string
  description?: string
  initial_state?: boolean
  trace?: {
    stored_traces?: number // default: 5
  }
  variables?: {
    [key: string]: any
  }
  trigger_variables?: {
    [key: string]: any
  }
  mode?: 'single' | 'restart' | 'queued' | 'parallel' // default: single
  max?: number // default: 10
  max_exceeded?: 'critical' | 'fatal' | 'error' | 'warning' | 'warn' | 'info' | 'debug' | 'notset' | 'silent' // default: 10
  triggers: ({
    alias?: string
    id?: string
    enabled?: boolean // default: true
    variables?: {
      [key: string]: any
    }
  } & HATrigger)[]
  conditions?: HACond[]
  actions: HAAction[]
}

interface JsonFeature {
  '~'?: string
  name: string
  has_entity_name: true
  unique_id: string
  retain: boolean
  icon?: string
  expire_after?: number
  off_delay?: number
  force_update?: boolean
  unit_of_measurement?: string
  effect_list?: string | string[]
  availability_topic?: string
  state_topic?: string
  command_topic?: string
  topic?: string
  max_kelvin?: number
  min_kelvin?: number
  color_temp_kelvin?: boolean
  flash_time_long?: number
  flash_time_short?: number
  min?: number
  max?: number
  step?: number
  brightness?: boolean
  brightness_scale?: number
  mode?: boolean
  supported_color_modes?: ("onoff" | "brightness" | "color_temp" | "hs" | "xy" | "rgb" | "rgbw" | "rgbww")[]
  options?: string[]
  schema?: 'json'
  automation_type?: 'trigger'
  type?: 'button_short_press' | 'button_short_release' | 'button_long_press' | 'button_long_release' | 'button_double_press' | 'button_triple_press' | 'button_quadruple_press' | 'button_quintuple_press' | string
  subtype?: 'turn_on' | 'turn_off' | 'button_1' | 'button_2' | 'button_3' | 'button_4' | 'button_5' | 'button_6' | string
  device: {
    name: string
    model?: string
    manufacturer?: string
    suggested_area?: string
    sw_version?: string
    identifiers: string | string[]
  }
}

export interface Entity {
  name: string,
  unique_id: string,
  type: "binary_sensor" |
  "button" |
  "device_trigger" |
  "light" |
  "lock" |
  "number" |
  "scene" |
  "select" |
  "sensor" |
  "switch",
  deviceIdentifier: string,
  commandTopic?: string,
  stateTopic?: string,
  availabilityTopic?: string,
  automationsTopic?: string,
}

const entities: Entity[] = []

async function reloadEntities() {
  console.log(`Reload Entities!`)
  entities.toSpliced(0)
  await subscribe('homeassistant/+/+/config', (msg, topic) => {
    try {
      const [_, type, unique_id, __] = topic.split('/') as [string, Entity['type'], string, string]

      const json = JSON.parse(msg) as JsonFeature

      entities.push({
        name: json.name,
        type,
        unique_id,
        deviceIdentifier: json.device.identifiers as string,
        commandTopic: json.command_topic?.replace('~', json['~'] ?? '~'),
        stateTopic: json.state_topic?.replace('~', json['~'] ?? '~'),
        availabilityTopic: json.availability_topic?.replace('~', json['~'] ?? '~'),
        automationsTopic: json.availability_topic?.replace('~', json['~'] ?? '~').split('/').toSpliced(-1, 1, 'automations').join('/'),
      })

    } catch (err) {
      console.error(`Failed to parse MQTT Discovery Config as JSON with error "${err?.toString() ?? err}", raw config: ${msg}`)
    }
    return 1000
  }, 5000)
}

async function getDeviceIdentifier(entityId: string): Promise<string> {
  console.log(`Get Device Identifier: ${entityId}`)
  const devId = (await (await fetch(URL + '/api/template', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.HA_TOKEN}`
    },
    body: `{"template":"{{ device_attr('${entityId}', 'identifiers') }}"}`,
  })).text()).match(/^{\('mqtt', '([^']+)'\)}$/)?.[1]

  if (devId)
    return devId
  else
    throw new Error(`Could not find device identifier for entityId "${entityId}"!`)
}

async function getEntity(entityId: string): Promise<Entity> {
  console.log(`Get Entity: ${entityId}`)
  if (entities.length === 0)
    await reloadEntities()

  // entityId = entityId.replace(/_\d+$/, '')

  const ents = entities.filter(({ unique_id }) => entityId.includes(unique_id))

  if (ents.length === 1)
    return ents[0]!
  else if (ents.length > 1) {
    let endsWith = ents.filter(({ unique_id }) => entityId.endsWith(unique_id))

    if (endsWith.length === 1)
      return endsWith[0]!
    else
      throw new Error(`Could not filter found MQTT Entities for entityId "${entityId}"! Matched results: ["${endsWith.join('", "')}"]`)
  }
  else
    throw new Error(`Could not find MQTT Entity for entityId "${entityId}"!`)
}

async function parseNumericRange(ents: string | string[], below: number | string | null = null, above: number | string | null = null): Promise<Condition> {
  console.log(`Parse Numeric Range: ${JSON.stringify(ents)} ${below} ${above}`)
  if (Array.isArray(ents)) {
    if (ents.length !== 1)
      throw new Error(`Currently only a single entity_id target is supported! ${JSON.stringify(ents)}`)
    else
      ents = ents[0]!
  }

  const ent = await getEntity(ents)

  if (typeof below === 'string')
    below = parseFloat(below)
  if (typeof above === 'string')
    above = parseFloat(above)

  if (!Number.isInteger(below) || !Number.isInteger(above))
    throw new Error(`Numeric Range Comparisons are only possible with integers! (no decimals) ${ents} ${below} | ${above}`)

  if (ent.type !== 'number')
    throw new Error(`Numeric Range Comparisons are only possible on entities of type "number"! ${JSON.stringify(ent)}`)

  const src = new Source(ent.stateTopic!, SrcType.INT)

  const conds: Condition[] = []
  if (below !== null)
    conds.push(new Condition(CompType.LT, src, below))
  if (above !== null)
    conds.push(new Condition(CompType.GT, src, above))

  if (conds.length === 0)
    throw new Error(`Numeric Range Comparisons require either below or above to bet set!`)
  else if (conds.length === 1)
    return conds[0]!
  else
    return Condition.fromChain(GateType.AND, ...conds)
}

function parseTargets(target: string | string[] | HATarget): string[] {
  console.log(`Parse Targets: ${JSON.stringify(target)}`)
  if (typeof target === 'string')
    return [target]
  else if (Array.isArray(target))
    return target
  else if (Object.keys(target).length === 1 && target.entity_id)
    return Array.isArray(target.entity_id) ? target.entity_id : [target.entity_id]
  else
    throw new Error(`Currently only entity_id targets are supported! ${JSON.stringify(target)}`)
}

async function parseTargetsEqual(target: string | string[] | HATarget, value: boolean | number): Promise<Condition> {
  console.log(`Parse Targets Equal: ${JSON.stringify(target)} == ${JSON.stringify(value)}`)
  const ents = parseTargets(target)
  if (ents.length !== 1)
    throw new Error(`Currently exactly one target must be supplied! ${JSON.stringify(target)}`)

  const ent = await getEntity(ents[0]!)

  switch (ent.type) {
    case 'binary_sensor':
    case 'switch':
      return new Condition(CompType.EQ, new Source(ent.stateTopic!, SrcType.LEN), value ? 2 : 3)
    case 'number':
      if (typeof value === 'boolean')
        return new Condition(value ? CompType.GT : CompType.EQ, new Source(ent.stateTopic!, SrcType.INT), 0)
      else
        return new Condition(CompType.EQ, new Source(ent.stateTopic!, SrcType.INT), value)
    default:
      throw new Error(`Entity type "${ent.type}" is not yet supported as a Source!`)
  }
}

async function parseCondition(condition: HACond): Promise<Condition> {
  console.log(`Parse Condition: ${JSON.stringify(condition)}`)
  if ('attribute' in condition || 'for' in condition)
    throw new Error(`Neither attributes nor durations are supported for Conditions! ${JSON.stringify(condition)}`)

  switch (condition.condition) {
    case 'state':
      if (Array.isArray(condition.state)) {
        if (condition.state.length !== 1)
          throw new Error(`Currently only a single state check is supported! ${JSON.stringify(condition)}`)
        else
          condition.state = condition.state[0]!
      }
      if (typeof condition.state === 'string') {
        if (/^\d+(\.0+)?$/.test(condition.state))
          condition.state = parseInt(condition.state)
        else
          throw new Error(`Currently only a boolean and number state checks are supported! ${JSON.stringify(condition)}`)
      }
      return parseTargetsEqual(condition.entity_id, condition.state)
    case 'numeric_state':
      if (condition.value_template)
        throw new Error(`Templates are not supported! ${JSON.stringify(condition)}`)
      return parseNumericRange(condition.entity_id, condition.below ?? null, condition.above ?? null)
    case 'switch.is_on':
      return parseTargetsEqual(condition.target, true)
    case 'switch.is_off':
      return parseTargetsEqual(condition.target, false)
    default:
      throw new Error(`Condition of type "${(condition as any).condition}" is not yet supported!`)
  }
}

async function parseTrigger(trigger: HATrigger): Promise<{ source: Source, condition: Condition }> {
  console.log(`Parse Trigger: ${JSON.stringify(trigger)}`)
  if ('attribute' in trigger || 'for' in trigger)
    throw new Error(`Neither attributes nor durations are supported for Triggers! ${JSON.stringify(trigger)}`)

  if (Array.isArray(trigger.entity_id)) {
    if (trigger.entity_id.length !== 1)
      throw new Error(`Currently only a single entity_id target is supported! ${JSON.stringify(trigger)}`)
    else
      trigger.entity_id = trigger.entity_id[0]!
  }

  let cond: Condition
  switch (trigger.trigger) {
    case 'state':
      if (trigger.from || trigger.not_from)
        throw new Error(`Triggers with a "from state" check are not supported! ${JSON.stringify(trigger)}`)
      return {
        condition: cond = (await parseCondition({ condition: 'state', entity_id: trigger.entity_id, state: trigger.to ?? trigger.not_to! })).negate(trigger.not_to ? true : false),
        source: cond.a as Source,
      }
    case 'numeric_state':
      if (trigger.value_template)
        throw new Error(`Templates are not supported! ${JSON.stringify(trigger)}`)
      return {
        condition: cond = await parseNumericRange(trigger.entity_id, trigger.below, trigger.above),
        source: cond.a as Source,
      }
    default:
      throw new Error(`Trigger of type "${(trigger as any).trigger}" is not yet supported!`)
  }
}

async function parseAction(action: HAAction, triggers: { source: Source, condition: Condition }[], masterCondition?: Condition): Promise<Action[]> {
  console.log(`Parse Action: ${JSON.stringify(action)}`)
  const ents = parseTargets(action.target)

  const acts: Action[] = []

  for (const entityId of ents) {
    const ent = await getEntity(entityId)

    if (!ent.commandTopic)
      throw new Error(`Cannot create an Action from Entity without a command_topic! ${JSON.stringify(ent)}`)

    let command: string

    switch (action.action) {
      case 'switch.turn_on':
        command = 'ON'
        break
      case 'switch.turn_off':
        command = 'OFF'
        break
      default:
        throw new Error(`Action of type "${(action as any).action}" is not yet supported!`)
    }

    for (const trig of triggers)
      acts.push(new Action(trig.source, masterCondition ? new Condition(GateType.AND, masterCondition, trig.condition) : trig.condition, ent.commandTopic, command))
  }

  return acts
}

export async function parseAutomation(automation: HAAutomation): Promise<string> {
  if (!automation.conditions ||
    automation.conditions[0]?.condition !== 'switch.is_on' ||
    automation.conditions[0]?.target.entity_id !== 'input_boolean.meshautomation')
    throw console.log(`Skipping automation because of missing first condition flag "switch.is_on > input_boolean.meshautomation" ${automation.id ?? automation.alias ?? JSON.stringify(automation)}`)

  // remove flag: input_boolean.meshautomation
  automation.conditions.shift()

  let triggerMasterCondition: Condition | undefined

  if (automation.conditions && automation.conditions.length > 0) {
    const conds = await Promise.all(automation.conditions.map(parseCondition))
    triggerMasterCondition = (conds.length === 1) ? conds[0]! : Condition.fromChain(GateType.AND, ...conds)
  }

  const triggers = await Promise.all(automation.triggers.map(parseTrigger))

  const actions = await Promise.all(automation.actions.map(act => parseAction(act, triggers, triggerMasterCondition)))

  const targetDevice = (await getEntity(automation.triggers[0]!.entity_id as string)).automationsTopic!.split('/').slice(0, -1).join('/')

  if (!targetDevice)
    throw new Error('Could not determine target device from automation!')

  return targetDevice
}

export async function parseHomeAssistant(yamlPath: string): Promise<Automation> {
  const automations = Bun.YAML.parse(readFileSync(yamlPath)) as HAAutomation[]
  for (const automation of automations) {
    return await createAutomation(parseAutomation, automation)
  }
}

if (import.meta.main) {
  await connected
  await parseHomeAssistant('automations/example.yaml')
  disconnect()
}