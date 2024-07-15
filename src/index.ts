import { Stream } from "./stream";

// Export all useful types for atoms
export type {
    Atom,
    AtomOk,
    AtomError,
    AtomException as AtomUnknown,
    VALUE,
    ERROR,
    EXCEPTION as UNKNOWN,
    MaybeAtom,
} from "./atom";

// Re-export useful utility types
export type { MaybePromise, Truthy, CallbackOrStream } from "./util";

export default Stream;
