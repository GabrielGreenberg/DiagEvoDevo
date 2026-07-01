// src/core/autograd/engine.ts
//
// Reverse-mode automatic differentiation over scalar `Value` nodes (micrograd-style).
// The figure's 48 parameters are leaf nodes; the score is built entirely from the
// differentiable primitives below; one backward() fills the exact gradient.
//
// This is the elegant solution AND the one that keeps the scoring function freely editable
// (ARCHITECTURE.md §Gradient strategy): autodiff differentiates whatever score we write, so
// changing a fidelity formula or adding a penalty needs no gradient maintenance.
//
// Correctness invariants baked in here (flagged by the math-core design pass):
//   • grad accumulates with `+=`, never `=` — the chain rule on a DAG is a sum over paths,
//     and the 48 leaves fan out into hundreds of nodes.
//   • `_prev` is an array (not a Set): the same node used twice in one op (x*x) must keep both
//     edges. Deduplication happens only in the topo-sort's `visited` set, keyed by node identity,
//     so each node's `_backward` still runs exactly once.
//   • backward()'s topological sort is ITERATIVE: the real score graph is hundreds deep and a
//     recursive DFS would overflow the stack.

export type Backward = () => void;

export class Value {
  data: number;
  grad = 0;
  _backward: Backward = () => {};
  readonly _prev: Value[];
  readonly _op: string;

  constructor(data: number, prev: Value[] = [], op = '') {
    this.data = data;
    this._prev = prev;
    this._op = op;
  }

  // ── ergonomic chaining methods (delegate to the free functions) ──
  add(other: Value | number): Value {
    return add(this, lift(other));
  }
  sub(other: Value | number): Value {
    return sub(this, lift(other));
  }
  mul(other: Value | number): Value {
    return mul(this, lift(other));
  }
  div(other: Value | number): Value {
    return div(this, lift(other));
  }
  neg(): Value {
    return neg(this);
  }
  pow(p: number): Value {
    return pow(this, p);
  }
  exp(): Value {
    return exp(this);
  }
  log(): Value {
    return log(this);
  }
  sqrt(): Value {
    return sqrt(this);
  }
  sigmoid(): Value {
    return sigmoid(this);
  }
}

/** Construct a Value leaf from a raw number. */
export function val(x: number): Value {
  return new Value(x);
}

/** Lift a number to a Value; pass Values through unchanged. */
export function lift(x: Value | number): Value {
  return typeof x === 'number' ? new Value(x) : x;
}

// ── Topological sort (iterative post-order over the DAG) ──────────────────────
// Returns nodes in children-before-parents order; the root ends up last.
function topoSort(root: Value): Value[] {
  const topo: Value[] = [];
  const visited = new Set<Value>();
  const frames: { node: Value; i: number }[] = [{ node: root, i: 0 }];
  visited.add(root);
  while (frames.length > 0) {
    const f = frames[frames.length - 1]!;
    if (f.i < f.node._prev.length) {
      const child = f.node._prev[f.i]!;
      f.i++;
      if (!visited.has(child)) {
        visited.add(child);
        frames.push({ node: child, i: 0 });
      }
    } else {
      topo.push(f.node);
      frames.pop();
    }
  }
  return topo;
}

/**
 * Reverse-mode backprop. Zeroes every reachable node's grad, seeds d(root)/d(root)=1,
 * then runs each node's local `_backward` in reverse topological order.
 */
export function backward(root: Value): void {
  const topo = topoSort(root);
  for (const node of topo) node.grad = 0;
  root.grad = 1;
  for (let i = topo.length - 1; i >= 0; i--) topo[i]!._backward();
}

// ── Primitive ops ─────────────────────────────────────────────────────────────
// Each returns a fresh Value and installs a `_backward` closure that ADDS its local
// derivative (× out.grad) onto each operand's grad.

export function add(a: Value, b: Value): Value {
  const out = new Value(a.data + b.data, [a, b], '+');
  out._backward = () => {
    a.grad += out.grad;
    b.grad += out.grad;
  };
  return out;
}

export function sub(a: Value, b: Value): Value {
  const out = new Value(a.data - b.data, [a, b], '-');
  out._backward = () => {
    a.grad += out.grad;
    b.grad += -out.grad;
  };
  return out;
}

export function mul(a: Value, b: Value): Value {
  const out = new Value(a.data * b.data, [a, b], '*');
  out._backward = () => {
    a.grad += b.data * out.grad;
    b.grad += a.data * out.grad;
  };
  return out;
}

export function div(a: Value, b: Value): Value {
  const out = new Value(a.data / b.data, [a, b], '/');
  out._backward = () => {
    a.grad += out.grad / b.data;
    b.grad += (-a.data / (b.data * b.data)) * out.grad;
  };
  return out;
}

export function neg(a: Value): Value {
  const out = new Value(-a.data, [a], 'neg');
  out._backward = () => {
    a.grad += -out.grad;
  };
  return out;
}

export function exp(a: Value): Value {
  const out = new Value(Math.exp(a.data), [a], 'exp');
  out._backward = () => {
    a.grad += out.data * out.grad; // d/da e^a = e^a = out.data
  };
  return out;
}

export function log(a: Value): Value {
  // Natural log. Requires a.data > 0 (guaranteed at call sites: ratio carriers are positive,
  // logLength keeps segment lengths off zero).
  const out = new Value(Math.log(a.data), [a], 'log');
  out._backward = () => {
    a.grad += out.grad / a.data;
  };
  return out;
}

export function pow(a: Value, p: number): Value {
  const out = new Value(Math.pow(a.data, p), [a], `pow(${p})`);
  out._backward = () => {
    a.grad += p * Math.pow(a.data, p - 1) * out.grad;
  };
  return out;
}

export function sqrt(a: Value): Value {
  // NOTE: d/da sqrt(a) = 1/(2·sqrt(a)) is singular at a=0. Length must be routed through
  // `logLength` (ops.ts), never through sqrt, in the optimized path. This op exists for
  // display magnitudes and guarded uses only.
  const s = Math.sqrt(a.data);
  const out = new Value(s, [a], 'sqrt');
  out._backward = () => {
    a.grad += out.grad / (2 * out.data);
  };
  return out;
}

export function sin(a: Value): Value {
  const out = new Value(Math.sin(a.data), [a], 'sin');
  out._backward = () => {
    a.grad += Math.cos(a.data) * out.grad;
  };
  return out;
}

export function cos(a: Value): Value {
  const out = new Value(Math.cos(a.data), [a], 'cos');
  out._backward = () => {
    a.grad += -Math.sin(a.data) * out.grad;
  };
  return out;
}

export function sigmoid(a: Value): Value {
  const s = 1 / (1 + Math.exp(-a.data));
  const out = new Value(s, [a], 'sigmoid');
  out._backward = () => {
    a.grad += out.data * (1 - out.data) * out.grad; // σ'(a) = σ(a)(1−σ(a))
  };
  return out;
}

export function atan2(y: Value, x: Value): Value {
  // Bearing. ∂/∂y atan2 = x/r², ∂/∂x atan2 = −y/r², with r² = x²+y².
  // Finite everywhere except the origin (r=0), which is the zero-length segment already
  // repelled by logLength. The derivative is periodic, so it is well-behaved across the
  // ±π branch cut (only atan2 *values* jump there — wrap angle DIFFERENCES, never differentiate
  // a wrap).
  const out = new Value(Math.atan2(y.data, x.data), [y, x], 'atan2');
  out._backward = () => {
    // r² = 0 only at the origin, where the bearing is genuinely undefined. Contribute a finite
    // (zero) gradient there instead of 0/0 = NaN, which would poison every leaf sharing the tape.
    const r2 = x.data * x.data + y.data * y.data;
    const inv = r2 === 0 ? 0 : 1 / r2;
    y.grad += x.data * inv * out.grad;
    x.grad += -y.data * inv * out.grad;
  };
  return out;
}
