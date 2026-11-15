export function _clear() {
  Source.all.splice(0)
  Condition.all.splice(0)
  Action.all.splice(0)
}

// -----

export enum SrcType {
  RAW,
  INT,
  LEN,
}

export class Source {
  static all: Source[] = []

  getId(): number {
    return Source.all.indexOf(this)
  }

  destroy() {
    console.log(`! Destroy Source ${SrcType[this.type]} "${this.topic}" !`)
    Source.all.splice(this.getId(), 1)
  }

  constructor(readonly topic: string, readonly type: SrcType) {
    const src = Source.all.find(src => src.type === type && src.topic === topic)
    if (src)
      return src
    Source.all.push(this)
  }

  toJSON() {
    return {
      id: this.getId(),
      type: this.type,
      topic: this.topic,
      state: 0,
    }
  }
}

// -----

export enum GateType {
  AND = 0,
  OR,
  XOR,
  NAND,
  NOR,
  XNOR,
}

export enum CompType {
  EQ = 128,
  NQ,
  GT,
  GE,
  LT,
  LE
}

export type CondType = GateType | CompType

export class Condition<T extends CondType = CondType> {
  static all: Condition[] = []

  static isGate<T extends CondType>(type: T): T extends CompType ? false : true {
    return type in GateType as any
  }

  static negate(type: CondType): CondType {
    if (type === GateType.AND)
      return GateType.NAND
    else if (type === GateType.OR)
      return GateType.NOR
    else if (type === GateType.XOR)
      return GateType.XNOR
    else if (type === GateType.NAND)
      return GateType.AND
    else if (type === GateType.NOR)
      return GateType.OR
    else if (type === GateType.XNOR)
      return GateType.XOR
    else if (type === CompType.EQ)
      return CompType.NQ
    else if (type === CompType.NQ)
      return CompType.EQ
    else if (type === CompType.LT)
      return CompType.GE
    else if (type === CompType.GT)
      return CompType.LE
    else if (type === CompType.LE)
      return CompType.GT
    else if (type === CompType.GE)
      return CompType.LT
    else
      throw new Error(`Cannot negate Condition of type "${type}"!`)
  }

  static convert(type: CompType): GateType
  static convert(type: GateType): CompType
  static convert(type: CondType): CondType
  static convert(type: CondType): CondType {
    if (type === GateType.XOR)
      return CompType.NQ
    else if (type === GateType.XNOR)
      return CompType.EQ
    else if (type === CompType.EQ)
      return GateType.XNOR
    else if (type === CompType.NQ)
      return GateType.XOR
    else
      throw new Error(`Cannot cast Condition of type "${CompType[type] ?? GateType[type]}"!`)
  }

  static mirror(type: CondType): CondType {
    if (type === CompType.LT)
      return CompType.GE
    else if (type === CompType.GT)
      return CompType.LE
    else if (type === CompType.LE)
      return CompType.GT
    else if (type === CompType.GE)
      return CompType.LT
    else
      return type
  }

  static fromSource(src: Source | Condition): Condition {
    if (src instanceof Condition)
      return src
    else
      return new Condition(CompType.NQ, src, 0)
  }

  // valid/direct
  static from(type: CompType, a: Source, b: Source): Condition<CompType>
  static from(type: CompType, a: Source, b: number): Condition<CompType>
  static from(type: GateType, a: Condition, b: Condition): Condition<GateType>
  // implicit/casted
  static from(type: CompType, a: number, b: Source): Condition<CompType>
  static from(type: CompType | GateType, a: Source | Condition, b: Source | Condition): Condition<GateType>
  static from(type: CompType | GateType, a: Source | Condition | number, b: Source | Condition | number): Condition {
    const isGate = Condition.isGate(type)
    const hasNumber = typeof a === 'number' || typeof b === 'number'
    const hasSource = a instanceof Source || b instanceof Source
    const hasCondition = a instanceof Condition || b instanceof Condition

    // handle all number cases
    if (hasNumber && !hasSource || (hasNumber && isGate)) {
      throw new Error(`Conditions only accept a constant input in combination with a source and as a comparison type! a: "${a}" b: "${b}" type: "${CompType[type] ?? GateType[type]}"`)
    }
    if (hasNumber) {
      if (typeof a === 'number')
        return new Condition(Condition.mirror(type) as CompType, b as Source, a)
      else
        return new Condition(type as CompType, a as Source, b as number)
    }
    // ---

    // handle all Source cases
    if (hasSource) {
      if (hasCondition) {
        const gate = isGate ? type as GateType : Condition.convert(type as CompType)
        const srcAsCond = Condition.fromSource(a instanceof Source ? a : b as Source)
        const cond = a instanceof Source ? b as Condition : a

        return new Condition(gate, srcAsCond, cond)
      } else if (isGate) {
        return new Condition(type as GateType, Condition.fromSource(a), Condition.fromSource(b))
      } else
        return new Condition(type as CompType, a as Source, b as Source)
    }
    // ---

    // handle all Condition cases
    if (hasCondition) {
      const gate = isGate ? type as GateType : Condition.convert(type as CompType)
      return new Condition(gate, a, b)
    }
    // ---

    throw new Error(`Condition.from reached it's end without returning! type: ${CompType[type] ?? GateType[type]} (raw:${type}) a: "${a}" b: "${b}"`)
  }

  static fromChain(type: GateType, ...inputs: (Condition | Source)[]): Condition<GateType> {
    if (inputs.length > 2) {
      let cur: (Condition | Source)[] = inputs.length % 2 ? inputs.slice(0, -1) : inputs
      let nxt: Condition<GateType>[] = []

      while (cur.length > 1) {
        for (let i = 0; i < cur.length; i += 2) {
          nxt.push(Condition.from(type, cur[i]!, cur[i + 1]!))
        }
        cur = nxt
        nxt = []
      }

      if (inputs.length % 2) {
        return Condition.from(type, nxt[0]!, inputs.at(-1)!)
      }
      else {
        return cur[0] as Condition<GateType>
      }
    }
    else if (inputs.length === 2) {
      return Condition.from(type, ...inputs as [Condition, Condition])
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

  constructor(type: CompType, a: Source, b: Source)
  constructor(type: CompType, a: Source, b: number)
  constructor(type: GateType, a: Condition, b: Condition)
  constructor(readonly type: T, readonly a: Source | Condition, readonly b: Source | Condition | number) {
    const cond = Condition.all.find(cond => cond.type === this.type && cond.a === this.a && cond.b === this.b)
    if (cond) {
      return cond as Condition<T>
    }

    Condition.all.push(this)
  }

  negate(): Condition<T extends CompType ? CompType : GateType> {
    return new Condition(Condition.negate(this.type) as any, this.a as any, this.b as any)
  }

  toJSON() {
    console.log(this)
    if (this.b instanceof Source)
      return {
        id: this.getId(),
        type: this.type,
        a: Math.min(this.a.getId(), this.b.getId()) | (Math.max(this.a.getId(), this.b.getId()) << 16),
        b: 0,
      }
    else
      return {
        id: this.getId(),
        type: this.type,
        a: this.a.getId(),
        b: typeof this.b === 'number' ? this.b : this.b.getId(),
      }
  }
}

// -----

export class Action {
  static all: Action[] = []

  getId(): number {
    return Action.all.indexOf(this)
  }

  destroy() {
    console.log(`! Destroy Action ${this.topic} "${this.data}" !`)
    Action.all.splice(this.getId(), 1)
  }

  constructor(readonly trigger: Source, readonly condition: Condition, readonly topic: string, readonly data: string) {
    Action.all.push(this)
  }

  toJSON() {
    return {
      id: this.getId(),
      condId: this.condition.getId(),
      triggerSrc: this.trigger.getId(),
      topic: this.topic,
      data: this.data,
    }
  }
}

// -----