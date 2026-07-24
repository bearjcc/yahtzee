import { DEFAULT_SHARED } from '../params.ts'
import type { ParamField } from './types.ts'

/** Form fields common to every algorithm. */
export const SHARED_PARAM_SCHEMA: ParamField[] = [
  {
    key: 'gamesPerFitness',
    label: 'Games / fitness',
    default: DEFAULT_SHARED.gamesPerFitness,
    step: '1',
    integer: true,
    min: 1,
  },
  {
    key: 'sharedGameFraction',
    label: 'Shared game fraction',
    default: DEFAULT_SHARED.sharedGameFraction,
    step: '0.05',
    min: 0,
    max: 1,
  },
  {
    key: 'fitnessStdPenalty',
    label: 'Fitness stdev penalty',
    default: DEFAULT_SHARED.fitnessStdPenalty,
    step: '0.05',
    min: 0,
  },
  {
    key: 'maxBots',
    label: 'Max bots (prune)',
    default: DEFAULT_SHARED.maxBots,
    step: '1',
    integer: true,
    min: 10,
  },
  {
    key: 'hidden1',
    label: 'Hidden layer 1',
    default: DEFAULT_SHARED.hidden1,
    step: '1',
    integer: true,
    min: 4,
  },
  {
    key: 'hidden2',
    label: 'Hidden layer 2',
    default: DEFAULT_SHARED.hidden2,
    step: '1',
    integer: true,
    min: 4,
  },
  {
    key: 'endMaxBots',
    label: 'End: total bots (0=off)',
    default: DEFAULT_SHARED.endMaxBots,
    step: '1',
    integer: true,
    min: 0,
  },
  {
    key: 'endTargetScore',
    label: 'End: target score (0=off)',
    default: DEFAULT_SHARED.endTargetScore,
    step: '1',
    min: 0,
  },
  {
    key: 'endStagnation',
    label: 'End: stagnation (0=off)',
    default: DEFAULT_SHARED.endStagnation,
    step: '1',
    integer: true,
    min: 0,
  },
  {
    key: 'batchSize',
    label: 'Eval batch size',
    default: DEFAULT_SHARED.batchSize,
    step: '1',
    integer: true,
    min: 1,
  },
]
