import { lezer } from "@lezer/generator/rollup";
import { defineConfig } from "rolldown";

export default defineConfig([
    {
        input: "glsl_parser/src/index.ts",
        external: (id) => id != "tslib" && !/^(\.?\/|\w:)/.test(id),
        output: [
            { file: "glsl_parser/dist/index.cjs", format: "cjs" },
            { dir: "glsl_parser/dist", format: "es" },
        ],
        plugins: [lezer()],
    },
    {
        input: "./src/editor/index.mjs",
        output: {
            file: "./dist/editor.bundle.js",
            format: "iife",
        },
    },
]);
