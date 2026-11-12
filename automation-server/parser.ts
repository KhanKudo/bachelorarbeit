
// -----

const refs: Map<string, Number | Source | Condition | Action> = new Map()
let internalRefCount = 0
function internalRef(value: Number | Source | Condition | Action): string {
  const ref = '_' + internalRefCount++
  refs.set(ref, value)
  return ref
}

let lineError: (error: string, line: string) => never

// -----

enum SrcType {
  RAW,
  INT,
  LEN,
}

class Source {
  static all: Source[] = []

  static from(line: string): Source {
    const ref = refs.get(line)
    if (ref instanceof Source)
      return ref
    else if (ref)
      lineError(`Variable is not a Source!`, line)

    const [match, type, topic] = line.match(/^(RAW|INT|LEN)\((.+)\)$/) ?? []
    if (!match || !topic)
      lineError(`Couldn't parse Source!`, line)

    return new Source(topic, SrcType[type as keyof typeof SrcType])
  }

  readonly id

  constructor(readonly topic: string, readonly type: SrcType) {
    this.id = Source.all.length
    Source.all.push(this)
  }
}

// -----

enum GateType {
  AND = 0,
  OR,
  XOR,
  NAND,
  NOR,
  XNOR,
}

enum CompType {
  EQ = 128,
  NQ,
  GT,
  GE,
  LT,
  LE
}

type CondType = GateType | CompType

class Condition<T extends CondType = CondType> {
  static all: Condition[] = []

  static from(line: string, negated: boolean = false): Condition {
    const ref = refs.get(line)
    if (ref instanceof Condition)
      return ref
    else if (ref instanceof Source)
      throw new Error('TODO: implicit Source to Condition')
    else if (ref)
      lineError(`Variable is not a Source!`, line)

    line = line
      .replace(/\s+/g, '')
      .replaceAll(/!?\(([^\(\)]*?)\)/g, (match, inner) => internalRef(Condition.from(inner, match[0] === '!')))

    // TODO: special handling of !, though 'kind of' easy, since all parentheses were already dealt with above, so now it's just about calling .negate or implicit source-to-gate conversion - heck, invert constants too

    const comps = ['==', '!=', '>', '<', '>=', '<=']

    // TODO: handle comparators - note that they are shareable, meaning combined with AND, allowing `1<=a<5` to become `1 <= a && a < 5`

    const gateMap: { [key: string]: GateType } = {
      '&&': GateType.AND,
      '||': GateType.OR,
      '^^': GateType.XOR,
    }

    const gateOrder: string[] = ['&&', '||', '^^']

    for (const gate of gateOrder.toReversed()) {
      line = internalRef(Condition.fromChain(gateMap[gate], ...line.split(gate).map(inner => Condition.from(inner))))
    }
  }

  static fromChain(type: GateType, ...inputs: Condition[]): Condition<GateType> {
    if (inputs.length > 2) {
      let cur: Condition[] = inputs.length % 2 ? inputs.slice(0, -1) : inputs
      let nxt: Condition<GateType>[] = []

      while (cur.length > 1) {
        for (let i = 0; i < cur.length; i += 2) {
          nxt.push(new Condition<GateType>(cur[i], cur[i + 1], type))
        }
        cur = nxt
        nxt = []
      }

      if (inputs.length % 2) {
        return new Condition(nxt[0], inputs.at(-1)!, type)
      }
      else {
        return cur[0] as Condition<GateType>
      }
    }
    else if (inputs.length === 2) {
      return new Condition(...inputs as [Condition, Condition], type)
    }
    else {
      throw new Error(`Cannot create a chained condition with ${inputs.length} input${inputs.length === 1 ? '' : 's'}!`)
    }
  }

  readonly id

  constructor(a: Source, b: Source, type: CompType)
  constructor(a: Source, b: Number, type: CompType)
  constructor(a: Condition, b: Condition, type: GateType)
  constructor(readonly a: Source | Condition, readonly b: Source | Condition | Number, readonly type: T) {
    this.id = Condition.all.length
    Condition.all.push(this)
  }

  negate(): this {
    if (this.type === GateType.AND)
      this.type == GateType.NAND
    else if (this.type === GateType.OR)
      this.type == GateType.NOR
    else if (this.type === GateType.XOR)
      this.type == GateType.XNOR
    else
      throw new Error(`Cannot negate Condition of type "${this.type}"!`)

    return this
  }
}

// -----

class Action {
  static all: Action[] = []

  readonly id

  constructor(readonly trigger: Source, readonly condition: Condition, readonly topic: string, readonly data: string) {
    this.id = Action.all.length
    Action.all.push(this)
  }
}

// -----

async function parse(file: string) {
  //@ts-ignore
  const lines: string[] = await Bun.file(file).text().split('\n')

  lineError = (err, line) => { throw new Error(`${err}!\n\tLine ${lines.indexOf(line)}: "${line}"`) }

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
        // actionTrigger = Source.from(rawLine)
      } else {
        actionCondition = Condition.from(line)
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

    if (lastEmpty) {
      try {
        actionTrigger = Source.from(line)
        continue // lastEmpty stays true
      } catch { }
    }

    lastEmpty = false

    // line must be an assigned if not matched yet
    const [match, ref, value] = line.match(/^([a-zA-Z][a-zA-Z_0-9]*)\s*=(.*)$/) ?? []
    if (!match)
      lineError(`Could not match name of assigned variable!`, line)

    if (refs.has(ref))
      lineError(`Duplicate definition of variable "${ref}"!`, line)

    // check if ref is a constant
    if (value.match(/^[0-9]+$/)) {
      refs.set(ref, Number.parseInt(value))
      continue
    }

    // check if ref is a source
    try {
      refs.set(ref, Source.from(value))
      continue
    } catch { }

    if (line.match(/!!/))
      lineError('Stacking negations (!) is not allowed!', line)

    // ref must be a condition
    refs.set(ref, Condition.from(value))
  }

  //@ts-ignore
  await Bun.file('./out.txt').write(txt)
}

//@ts-ignore
await parse('./automation_format.txt')