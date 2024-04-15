import { HigherOrderStream } from "./higher-order";

export type { StreamEnd } from "./base";

export class Stream<T, E> extends HigherOrderStream<T, E> {}
