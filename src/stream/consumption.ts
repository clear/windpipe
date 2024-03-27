import { isOk, type Atom } from "../atom";
import { StreamBase } from "./base";

export class StreamConsumption<T, E> extends StreamBase<T, E> {
    /**
     * Create an iterator that will emit each atom in the stream.
     *
     * @group Consumption
     */
    [Symbol.asyncIterator](): AsyncIterator<Atom<T, E>> {
        return this.stream[Symbol.asyncIterator]();
    }

    /**
     * Create an async iterator that will emit each value in the stream.
     *
     * @group Consumption
     */
    values(): AsyncIterator<T> {
        const it = this[Symbol.asyncIterator]();

        return {
             async next() {
                const { value, done } = await it.next();

                if (done) {
                    return { value, done: true };
                } else if (isOk(value)) {
                    return { value: value.value };
                } else {
                    return await this.next();
                }
            }
        }
    }

    /**
     * Iterate through each atom in the stream, and return them as a single array.
     *
     * @param options.atom - Return every atom on the stream.
     *
     * @group Consumption
     */
    async toArray(options?: { atoms: false }): Promise<T[]>;
    async toArray(options?: { atoms: true }): Promise<Atom<T, E>[]>;
    async toArray({ atoms = false }: { atoms?: boolean } = {}): Promise<(Atom<T, E> | T)[]> {
        const array: (Atom<T, E> | T)[] = [];

        for await (const atom of this) {
            if (atoms) {
                array.push(atom);
            } else if (isOk(atom)) {
                array.push(atom.value);
            }
        }

        return array;
    }
}
