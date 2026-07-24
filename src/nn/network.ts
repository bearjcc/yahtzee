export interface NetShape {
  inputSize: number
  hidden1: number
  hidden2: number
  outputSize: number
}

export function genomeLength(shape: NetShape): number {
  const { inputSize: i, hidden1: h1, hidden2: h2, outputSize: o } = shape
  return i * h1 + h1 + h1 * h2 + h2 + h2 * o + o
}

export function defaultShape(inputSize: number, outputSize: number, h1 = 48, h2 = 32): NetShape {
  return { inputSize, hidden1: h1, hidden2: h2, outputSize }
}

function relu(x: number): number {
  return x > 0 ? x : 0
}

/** Layout: W1[i*h1], b1[h1], W2[h1*h2], b2[h2], W3[h2*o], b3[o] (row-major). */
export function forward(genome: Float32Array, shape: NetShape, input: Float32Array): Float32Array {
  const { inputSize: i, hidden1: h1, hidden2: h2, outputSize: o } = shape

  const a1 = new Float32Array(h1)
  for (let j = 0; j < h1; j++) {
    let sum = 0
    for (let k = 0; k < i; k++) sum += input[k]! * genome[k * h1 + j]!
    a1[j] = relu(sum + genome[i * h1 + j]!)
  }
  let p = i * h1 + h1

  const a2 = new Float32Array(h2)
  for (let j = 0; j < h2; j++) {
    let sum = 0
    for (let k = 0; k < h1; k++) sum += a1[k]! * genome[p + k * h2 + j]!
    a2[j] = relu(sum + genome[p + h1 * h2 + j]!)
  }
  p += h1 * h2 + h2

  const out = new Float32Array(o)
  for (let j = 0; j < o; j++) {
    let sum = 0
    for (let k = 0; k < h2; k++) sum += a2[k]! * genome[p + k * o + j]!
    out[j] = sum + genome[p + h2 * o + j]!
  }
  return out
}

export function randomGenome(shape: NetShape, rng: () => number, scale = 0.4): Float32Array {
  const n = genomeLength(shape)
  const g = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const u = Math.max(rng(), 1e-9)
    const v = Math.max(rng(), 1e-9)
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    g[i] = z * scale
  }
  return g
}
