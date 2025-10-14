import { lezer } from "@lezer/generator/rollup";
import { defineConfig } from "rolldown";

export default defineConfig([
    {
        input: "./src/index.ts",
        output: {
            file: "./dist/dist.js",
            format: "iife",
            sourcemap: true,
        },
        plugins: [lezer()],
    },
]);
