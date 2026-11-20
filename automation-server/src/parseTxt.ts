import { readFileSync } from "fs"
import { CompType, Action, Condition, Source, SrcType, type CondType, GateType, type Automation, createAutomation } from "./core"
import { connected, disconnect } from "./mqtt"

const refs: Map<string, number | Source | Condition> = new Map()
let internalRefCount = 0
function internalRef(value: number | Source | Condition): string {
  const ref = '_' + internalRefCount++
  refs.set(ref, value)
  console.log(`${ref} => ${value}`)
  return ref
}

let lineError: (error: string, line: string) => never

// -----

function sourceFromString(line: string): Source {
  const ref = refs.get(line)
  if (ref instanceof Source)
    return ref
  else if (ref)
    lineError(`Variable is not a Source!`, line)

  const [match, type, topic] = line.match(new RegExp(`^(${Object.keys(SrcType).join('|')})\\((.+)\\)$`)) ?? []
  if (!match || !topic)
    lineError(`Couldn't parse Source!`, line)

  return new Source(topic, SrcType[type as keyof typeof SrcType])
}

// -----

const order: ([string, CondType] | [string, CondType][])[] = [
  [
    ['==', CompType.EQ],
    ['!=', CompType.NQ],
    ['>=', CompType.GE],
    ['<=', CompType.LE],
    ['>', CompType.GT],
    ['<', CompType.LT],
  ],
  ['&&', GateType.AND],
  ['||', GateType.OR],
  ['^^', GateType.XOR],
]

function parseString(part: string): number | Condition | Source
function parseString(part: string, noNumber: true): Condition | Source
function parseString(part: string, noNumber: boolean = false): number | Condition | Source {
  let res
  if (part.match(/^[0-9]+$/))
    res = Number.parseInt(part)
  else if (refs.has(part))
    res = refs.get(part)!
  else
    throw new Error(`Unable to parse string "${part}": no ref-entry found, not a positive integer!`)

  if (typeof res === 'number' && noNumber)
    throw new Error(`Unable to parse string "${part}": is a number, but noNumber flag has been set!`)

  return res
}

function conditionFromString(line: string, depth: number = order.length): Condition {
  if (depth === order.length) {
    line = line
      .replace(/\s+/g, '')
      .replace(/!([a-zA-Z_0-9]+)|!\(([a-zA-Z_0-9]+)\)/g, (_, part) => {
        const res = parseString(part)
        if (typeof res === 'number')
          return res === 0 ? '1' : '0'
        else if (res instanceof Condition)
          return internalRef(res.negate())
        else
          return internalRef(new Condition(CompType.EQ, res, 0))
      })
      .replace(/!\(([^\(\)]*?)\)/g, (match, inner) => {
        const res = conditionFromString(inner, depth - 1)
        const neg = match[0] === '!'
        return internalRef(neg ? res.negate() : res)
      })
    depth--
  }

  const op = order[depth]

  if (!Array.isArray(op))
    throw new Error(`Out of Depth! Order has ${order.length} elements, depth is at "${depth}"`)

  if (typeof op[0] === 'string') {
    const delimiter = op[0]
    const type = op[1] as GateType
    if (!Condition.isGate(op[1] as CondType))
      throw new Error('Comparisons are mandated to be "shareable" (equal order), only gates may be ordered!')

    const parts = line.split(delimiter)
    if (parts.length === 1)
      try { return Condition.fromSource(parseString(line, true)) }
      catch { return conditionFromString(line, depth - 1) }

    return Condition.fromChain(type, ...parts.map(part => parseString(part, true)))
  }
  else {
    const regexDelimiter = `(?:${(op as any[]).map(v => v[0].replace(/([^a-z])/gi, '\\$1')).join('|')})`
    let last: Source | number | null = null
    const comps: Condition<CompType>[] = []
    line = line.replace(new RegExp(`([a-zA-Z_0-9]*)(${regexDelimiter})([a-zA-Z_0-9]+)`, 'g'), (_, a, comp, b) => {
      a = a ? parseString(a) : last
      b = parseString(b)
      last = b
      comp = Object.fromEntries(op as [string, CondType][])[comp]!
      comps.push(Condition.from(comp, a, b))
      return ''
    })

    if (line)
      throw new Error(`Unmatched line elements still remain at the end of processing: "${line}"`)

    if (comps.length === 1)
      return comps[0]!
    else
      return Condition.fromChain(GateType.AND, ...comps)
  }
}

// -----

export async function parseTxt(file: string): Promise<Automation> {
  return createAutomation(async () => {
    const lines: string[] = readFileSync(file).toString().split('\n')

    lineError = (err, line) => { throw new Error(`${err}!\n\tLine ${lines.indexOf(line)}: "${line}"`) }

    let targetDevice: string | null = null

    let lastEmpty: boolean = true
    let actionTrigger: Source | null = null
    let actionCondition: Condition | null = null
    let actionTopic: string | null = null
    let actionData: string | null = null
    for (const line of lines) {
      if (actionTrigger !== null) {
        if (actionData !== null) {
          if (line.length === 0) {
            new Action(actionTrigger!, actionCondition!, actionTopic!, actionData)
            actionTrigger = null
            actionCondition = null
            actionTopic = null
            actionData = null
          } else {
            actionData += '\n' + line
          }
        } else if (actionTopic !== null) {
          actionData = line
        } else if (actionCondition !== null) {
          actionTopic = line
        } else {
          actionCondition = conditionFromString(line)
        }
        continue
      }

      // ignore comments
      if (line[0] === '#')
        continue

      // keep track of and skip empty lines
      if (line.length === 0) {
        lastEmpty = true
        continue
      }

      if (lastEmpty && targetDevice) {
        try {
          actionTrigger = sourceFromString(line)
          continue // lastEmpty stays true
        } catch { }
      }

      lastEmpty = false

      if (!targetDevice) {
        console.log(`Set Target Device: "${line}"`)
        targetDevice = line
        continue
      }

      // line must be an assigned if not matched yet
      const [match, ref, value] = line.match(/^([a-zA-Z][a-zA-Z_0-9]*)\s*=\s*(.*)$/) ?? []
      if (!match || !ref || !value)
        lineError(`Could not match assignment of variable!`, line)

      if (refs.has(ref))
        lineError(`Duplicate definition of variable "${ref}"!`, line)

      // check if ref is a constant
      if (value.match(/^[0-9]+$/)) {
        console.log(`New Constant "${ref}" -> ${value}`)
        refs.set(ref, Number.parseInt(value))
        continue
      }

      // check if ref is a source
      try {
        refs.set(ref, sourceFromString(value))
        console.log(`New Source "${ref}" -> ${value}`)
        continue
      } catch { }

      const refVal = refs.get(value)
      if (refVal) {
        refs.set(ref, refVal)
        continue
      }

      if (line.match(/!!/))
        lineError('Stacking negations (!) is not allowed!', line)

      // ref must be a condition
      console.log(`New Condition "${ref}" -> ${value}`)
      refs.set(ref, conditionFromString(value))
    }

    if (!targetDevice)
      throw new Error('Could not find target device in txt!')

    return targetDevice
  })
}

if (import.meta.main) {
  await connected
  await parseTxt('automations/example.txt')
  disconnect()
}