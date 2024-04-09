import { Stream } from "./stream";
import type { StreamBase } from "./stream/base";
export * as atom from "./atom";

export { Stream } from "./stream";

// Attempt to emulate Highland API
type HighlandConstructor = typeof StreamBase["from"] & { of: typeof StreamBase["of"] };
export const $: HighlandConstructor = Stream.from as HighlandConstructor;
$.of = Stream.of;
