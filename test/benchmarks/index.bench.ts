import { describe, bench } from "vitest";
import Stream from "../../src";
import Highland from "highland";
import { StreamEnd } from "../../src/stream/base";
import { error, ok } from "../../src/atom";

const SAMPLE_SIZE = 10;
const ARRAY = new Array(SAMPLE_SIZE).fill(undefined).map((_, i) => i);

describe("stream creation from next function", () => {
    bench("windpipe", async () => {
        let i = 0;
        await Stream.from(async () => {
            if (i < SAMPLE_SIZE) {
                return i++;
            } else {
                return StreamEnd;
            }
        }).toArray();
    });

    bench("highland", () => {
        return new Promise((resolve) => {
            let i = 0;

            Highland((push, next) => {
                if (i < SAMPLE_SIZE) {
                    push(null, i++);
                    next();
                } else {
                    push(null, Highland.nil);
                }
            }).toArray(() => resolve());
        });
    });
});

describe("simple transform operations", () => {
    bench("windpipe", async () => {
        await Stream.from(ARRAY)
            .map((n) => n + 100)
            .toArray();
    });

    bench("highland", () => {
        return new Promise((resolve) => {
            Highland(ARRAY)
                .map((n) => n + 100)
                .toArray(() => resolve());
        });
    });
});

describe("sample data operations", () => {
    bench("windpipe", async () => {
        await Stream.from([
            {
                name: "test user 1",
                id: 1,
                permissions: {
                    read: true,
                    write: true,
                },
                balance: 100,
            },
            {
                name: "test user 2",
                id: 2,
                permissions: {
                    read: true,
                    write: false,
                },
                balance: -100,
            },
            {
                name: "test user 3",
                id: 3,
                permissions: {
                    read: false,
                    write: false,
                },
                balance: 83,
            },
            {
                name: "test user 4",
                id: 4,
                permissions: {
                    read: true,
                    write: false,
                },
                balance: 79,
            },
            {
                name: "test user 5",
                id: 5,
                permissions: {
                    read: true,
                    write: false,
                },
                balance: 51,
            },
        ])
            .map((person) => {
                if (person.balance < 0) {
                    return error<typeof person, string>("invalid balance");
                } else {
                    return ok(person);
                }
            })
            .filter((person) => {
                return person.permissions.read;
            })
            .map((person) => {
                return {
                    id: person.id,
                    balance: person.balance,
                };
            })
            .map(({ id, balance }) => `#${id}: $${balance}.00`)
            .toArray();
    });

    bench("highland", () => {
        return new Promise((resolve) => {
            Highland([
                {
                    name: "test user 1",
                    id: 1,
                    permissions: {
                        read: true,
                        write: true,
                    },
                    balance: 100,
                },
                {
                    name: "test user 2",
                    id: 2,
                    permissions: {
                        read: true,
                        write: false,
                    },
                    balance: -100,
                },
                {
                    name: "test user 3",
                    id: 3,
                    permissions: {
                        read: false,
                        write: false,
                    },
                    balance: 83,
                },
                {
                    name: "test user 4",
                    id: 4,
                    permissions: {
                        read: true,
                        write: false,
                    },
                    balance: 79,
                },
                {
                    name: "test user 5",
                    id: 5,
                    permissions: {
                        read: true,
                        write: false,
                    },
                    balance: 51,
                },
            ])
                .map((person) => {
                    if (person.balance < 0) {
                        throw "invalid balance";
                    } else {
                        return person;
                    }
                })
                .filter((person) => {
                    return person.permissions.read;
                })
                .map((person) => {
                    return {
                        id: person.id,
                        balance: person.balance,
                    };
                })
                .map(({ id, balance }) => `#${id}: $${balance}.00`)
                .errors(() => {})
                .toArray(() => resolve());
        });
    });
});
