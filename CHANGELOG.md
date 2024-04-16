# windpipe

## 0.4.0

### Minor Changes

- e55d490: create new `ofError` and `ofUnknown` static methods for creating a stream
- e55d490: alter exported API
- 341ef76: add `flatTap`

## 0.3.1

### Patch Changes

- edd7aad: add Atom types to export

## 0.3.0

### Minor Changes

- 0aebf68: add `$.ok`, `$.error`, and `$.unknown` methods, to simplify creation of single atom streams.

  restrict items exported from `./atom.ts`, as not everything was required for the public API.

## 0.2.0

### Minor Changes

- 22723f5: add `drop` stream transform
