
// -----

const refs: Map<string, Number | Source | Condition | Action> = new Map()
let internalRefCount = 0
function internalRef(value: Number | Source | Condition | Action): string {
  const ref = '_' + internalRefCount++
  refs.set(ref, value)
  console.log(`${ref} => ${value}`)
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

    const [match, type, topic] = line.match(new RegExp(`^(${Object.keys(SrcType).join('|')})\((.+)\)$`)) ?? []
    if (!match || !topic)
      lineError(`Couldn't parse Source!`, line)

    return new Source(topic, SrcType[type as keyof typeof SrcType])
  }

  getId(): number {
    return Source.all.indexOf(this)
  }

  destroy() {
    console.log(`! Destroy Source ${SrcType[this.type]} "${this.topic}" !`)
    Source.all.splice(this.getId(), 1)
  }

  constructor(readonly topic: string, readonly type: SrcType) {
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

  static from(line: string): Condition {
    const ref = refs.get(line)
    if (ref instanceof Condition) {
      console.log(`${line} -> Condition`)
      return ref
    } else if (ref instanceof Source) {
      console.log(`${line} -> Source`)
      return new Condition(ref, 0, CompType.NQ)
    } else if (ref) {
      throw new Error(`Variable is not a Condition or a Source: "${line}" -> "${ref}"`)
    }

    line = line
      .replace(/\s+/g, '')
      .replaceAll(/!?\(([^\(\)]*?)\)/g, (match, inner) => {
        let cond = Condition.from(inner)
        return internalRef((match[0] === '!') ? cond.negate() : cond)
      })
      .replaceAll(/!([a-zA-Z_0-9]+)/g, (_, inner) => internalRef(Condition.from(inner).negate()))

    const compMap: { [key: string]: CompType } = {
      '==': CompType.EQ,
      '!=': CompType.NQ,
      '>=': CompType.GE,
      '<=': CompType.LE,
      '>': CompType.GT,
      '<': CompType.LT,
    }
    const mirroredCompMap: { [key: string]: CompType } = {
      '==': CompType.EQ,
      '!=': CompType.NQ,
      '>=': CompType.LT,
      '<=': CompType.GT,
      '>': CompType.LE,
      '<': CompType.GE,
    }

    line = line.replace(/[a-zA-Z_0-9]+(?:(?:==|!=|>|<|>=|<=)[a-zA-Z_0-9]+)+/g, (group) => {
      let last: Source | Number | null = null
      const comps: Condition<CompType>[] = []
      group.replace(/([a-zA-Z_0-9]*)(.+?)([a-zA-Z_0-9]+)/g, (_, a, comp, b) => {
        if (a === '')
          a = last
        else if (refs.has(a))
          a = refs.get(a)
        else
          try {
            a = Source.from(a)
          } catch {
            a = parseInt(a)
          }

        if (refs.has(b))
          b = refs.get(b)
        else
          try {
            b = Source.from(b)
          } catch {
            b = parseInt(b)
          }

        last = b

        if (typeof a === 'number' && typeof b === 'number') {
          throw new Error(`Comparisons between two constants are not allowed: "${group}"`)
        } else if (a instanceof Source && b instanceof Source) {
          comps.push(new Condition(a, b, compMap[comp as keyof typeof CompType]))
        } else if (a instanceof Source && typeof b === 'number') {
          comps.push(new Condition(a, b, compMap[comp as keyof typeof CompType]))
        } else if (typeof a === 'number' && b instanceof Source) {
          comps.push(new Condition(b, a, mirroredCompMap[comp as keyof typeof CompType]))
        } else {
          throw new Error(`Invalid types found for comparison! group: "${group}" a: "${a}", b: "${b}"`)
        }

        return ''
      })

      if (comps.length === 1)
        return internalRef(comps[0])

      return internalRef(Condition.fromChain(GateType.AND, ...comps))
    })

    const gateOrder: { [key: string]: GateType } = {
      '&&': GateType.AND,
      '||': GateType.OR,
      '^^': GateType.XOR,
    }

    for (const gate in gateOrder) {
      line = line.replace(new RegExp(`[a-zA-Z_0-9]+(?:${gate.replace(/(.)/g, '\\$1')}[a-zA-Z_0-9]+)+`, 'g'), (group) => {
        const gates = group.split(gate).map(elem => Condition.from(elem))
        if (gates.length === 1)
          return internalRef(gates[0])
        return internalRef(Condition.fromChain(gateOrder[gate], ...gates))
      })
    }

    const out = refs.get(line)
    if (out instanceof Condition)
      return out
    else
      throw new Error(`Condition.from trying to return a non-condition result: "${line}" -> "${out}"`)
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

  getId(): number {
    return Condition.all.indexOf(this)
  }

  destroy() {
    console.log(`! Destroy Condition ${CompType[this.type] ?? GateType[this.type]} "${this.a}" "${this.b}" !`)
    Condition.all.splice(this.getId(), 1)
  }

  constructor(a: Source, b: Source, type: CompType)
  constructor(a: Source, b: Number, type: CompType)
  constructor(a: Condition, b: Condition, type: GateType)
  constructor(readonly a: Source | Condition, readonly b: Source | Condition | Number, readonly type: T) {
    Condition.all.push(this)
  }

  negate(): Condition<T extends CompType ? CompType : GateType> {
    let negType: CondType
    if (this.type === GateType.AND)
      negType = GateType.NAND
    else if (this.type === GateType.OR)
      negType = GateType.NOR
    else if (this.type === GateType.XOR)
      negType = GateType.XNOR
    else if (this.type === GateType.NAND)
      negType = GateType.AND
    else if (this.type === GateType.NOR)
      negType = GateType.OR
    else if (this.type === GateType.XNOR)
      negType = GateType.XOR
    else if (this.type === CompType.EQ)
      negType = CompType.NQ
    else if (this.type === CompType.NQ)
      negType = CompType.EQ
    else if (this.type === CompType.LT)
      negType = CompType.GE
    else if (this.type === CompType.GT)
      negType = CompType.LE
    else if (this.type === CompType.LE)
      negType = CompType.GT
    else if (this.type === CompType.GE)
      negType = CompType.LT
    else
      throw new Error(`Cannot negate Condition of type "${this.type}"!`)

    return new Condition(this.a as any, this.b as any, negType as any)
  }
}

// -----

class Action {
  static all: Action[] = []

  getId(): number {
    return Action.all.indexOf(this)
  }

  destroy() {
    Action.all.splice(this.getId(), 1)
  }

  constructor(readonly trigger: Source, readonly condition: Condition, readonly topic: string, readonly data: string) {
    Action.all.push(this)
  }
}

// -----

async function parse(file: string) {
  //@ts-ignore
  const lines: string[] = (await Bun.file(file).text()).split('\n')

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
    const [match, ref, value] = line.match(/^([a-zA-Z][a-zA-Z_0-9]*)\s*=\s*(.*)$/) ?? []
    if (!match)
      lineError(`Could not match name of assigned variable!`, line)

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
      refs.set(ref, Source.from(value))
      console.log(`New Source "${ref}" -> ${value}`)
      continue
    } catch { }

    if (line.match(/!!/))
      lineError('Stacking negations (!) is not allowed!', line)

    // ref must be a condition
    console.log(`New Condition "${ref}" -> ${value}`)
    refs.set(ref, Condition.from(value))
  }

  // remove unused sources/conditions
  const unusedSources = new Set(Source.all)
  const unusedConditions = new Set(Condition.all)

  const checkUsed = (condition: Condition) => {
    unusedConditions.delete(condition)

    if (condition.a instanceof Source)
      unusedSources.delete(condition.a)
    else if (condition.a instanceof Condition)
      checkUsed(condition.a)

    if (condition.b instanceof Source)
      unusedSources.delete(condition.b)
    else if (condition.b instanceof Condition)
      checkUsed(condition.b)
  }

  for (const act of Action.all) {
    unusedSources.delete(act.trigger)
    checkUsed(act.condition)
  }

  for (const src of unusedSources)
    src.destroy()
  for (const cond of unusedConditions)
    cond.destroy()

  // for debugging, write a txt file

  let txt = `# Resulting output ${new Date().toString()}\n\n`

  for (const src of Source.all)
    txt += `Source #${src.getId()}: ${SrcType[src.type]} | ${src.topic}\n`
  txt += `\n`

  for (const cond of Condition.all)
    txt += `Condition #${cond.getId()}: ${CompType[cond.type] ?? GateType[cond.type]} | ${cond.a?.getId?.() ?? cond.a} | ${(cond.b as any)?.getId?.() ?? cond.b}\n`
  txt += `\n`

  for (const act of Action.all)
    txt += `Action #${act.getId()}: WHEN ${act.trigger.getId()} IF ${act.condition.getId()} DO ${act.topic} WITH ${act.data}\n`
  txt += `\n# End\n`

  console.log('!!!FINISHED!!!')

  //@ts-ignore
  await Bun.file('./out.txt').write(txt)
}

//@ts-ignore
await parse('./format.txt')