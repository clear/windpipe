import type { AnyStream, Stream } from ".";

export type Condition<T> = (value: T) => boolean;

export type ConditionHandler<T, E> = (value: T) => Stream<T, E>;

export class IfBuilder<T, E> {
    stream: AnyStream<T, E>;
    conditions: Array<{ condition: Condition<T>, handler: ConditionHandler<T, E> }> = [];

    constructor(stream: AnyStream<T, E>) {
        this.stream = stream;
    }

    else_if(condition: Condition<T>, handler: ConditionHandler<T, E>): IfBuilder<T, E> {
        this.conditions.push({ condition, handler });

        return this;
    }

    else(else_handler: ConditionHandler<T, E>): Stream<T, E> {
        return this.stream.flat_map((value) => {
            const handler = this.conditions.find(({ condition }) => condition(value))?.handler || else_handler;

            return handler(value);
        });
    }
}

