import {
    ok,
    error,
    exception,
    isOk,
    isError,
    isException,
    type Atom,
    type AtomOk,
    type AtomError,
    type AtomException,
} from "../atom";
import { HigherOrderStream } from "./higher-order";

export type { StreamEnd } from "./base";
export { WindpipeConsumptionError } from "./consumption";

/**
 * @template T - Type of the 'values' on the stream.
 * @template E - Type of the 'errors' on the stream.
 */
export class Stream<T, E> extends HigherOrderStream<T, E> {
    // Re-export atom utilities for convenience
    /**
     * Create an `ok` atom with the provided value.
     *
     * @group Atom
     */
    static ok<T, E>(value: T): Atom<T, E> {
        return ok(value);
    }

    /**
     * Create an `error` atom with the provided value.
     *
     * @group Atom
     */
    static error<T, E>(value: E): Atom<T, E> {
        return error(value);
    }

    /**
     * Create an `exception` atom with the provided value.
     *
     * @group Atom
     */
    static exception<T, E>(value: unknown, trace: string[]): Atom<T, E> {
        return exception(value, trace);
    }

    /**
     * @group Atom
     * @deprecated use `exception` instead
     */
    static unknown<T, E>(value: unknown, trace: string[]): Atom<T, E> {
        return this.exception(value, trace);
    }

    /**
     * Verify if the provided atom is of the `ok` variant.
     *
     * @group Atom
     */
    static isOk<T, E>(atom: Atom<T, E>): atom is AtomOk<T> {
        return isOk(atom);
    }

    /**
     * Verify if the provided atom is of the `error` variant.
     *
     * @group Atom
     */
    static isError<T, E>(atom: Atom<T, E>): atom is AtomError<E> {
        return isError(atom);
    }

    /**
     * Verify if the provided atom is of the `exception` variant.
     *
     * @group Atom
     */
    static isException<T, E>(atom: Atom<T, E>): atom is AtomException {
        return isException(atom);
    }

    /**
     * @group Atom
     * @deprecated use `isException` instead
     */
    static isUnknown<T, E>(atom: Atom<T, E>): atom is AtomException {
        return this.isException(atom);
    }
}
