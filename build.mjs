import { build } from "esbuild";
import { writeFile } from "node:fs/promises";

const ENTRY = "src/index.ts";

function buildEsm() {
    return build({
        entryPoints: [ENTRY],
        outfile: "dist/index.js",
        bundle: true,
        platform: "node",
        format: "esm",
        target: "es2022",
        sourcemap: true,
        external: [], // put deps here if you don't want to bundle them
    });
}

async function buildCjs() {
    // Build using esm
    await build({
        entryPoints: [ENTRY],
        outfile: "dist/core.cjs",
        bundle: true,
        platform: "node",
        format: "cjs",
        target: "es2022",
        sourcemap: true,
        external: [],
    });

    // Then build an entry point so we can get a nice default export
    await writeFile(
        "dist/index.cjs",
        '"use strict";\nmodule.exports=require("./core.cjs").default;',
    );

    return writeFile("dist/index.d.cts", 'import Stream from "./index.js"; export = Stream;');
}

await Promise.all([buildEsm(), buildCjs()]);
