import { GLSLLanguage, keywords, glsl_keywords } from "./language"

import { syntaxTree } from "@codemirror/language"
import { SyntaxNode, SyntaxNodeRef, IterMode, NodeWeakMap } from "@lezer/common"
import { completeFromList, CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete"

// Just to be explicit about the type we are referencing by "Text"
import { Text } from "@codemirror/state"

// Helper functions for variable and function declarations. It would be nice to abstract them in a map like in the javascript example
function IsVariableDeclaration(node: SyntaxNodeRef) { return node.name == "VariableDeclaration"; }
function GetVariableNameNodeFromDeclaration(node: SyntaxNodeRef) { return node.node.getChild("Identifier"); }

function IsFunctionDefinition(node: SyntaxNodeRef) { return node.name == "FunctionDeclaration" || node.name == "FunctionDefinition"; }
function GetFunctionNameNodeFromDefinition(node: SyntaxNodeRef) { return node.node.getChild("FunctionHeader")?.getChild("Identifier"); }

// Keep one "static" cache for now, but it would be nice to have one per extension instance
const cache = new NodeWeakMap<readonly Completion[]>();

function GetDefinitionsUntil(doc: Text, node: SyntaxNode, until: number) {
    let cached = cache.get(node);
    if (cached) return cached;

    let definitions: Completion[] = [];

    // Iterate through all the nodes in the block and gather all the definitions.
    node.cursor(IterMode.IncludeAnonymous).iterate(current_node => {
        // Stop iterating when we reach the limit
        if (current_node.from >= until) return false;

        // Variables
        if (IsVariableDeclaration(current_node)) {
            const variable_name_node = GetVariableNameNodeFromDeclaration(current_node);
            if (variable_name_node)
                definitions.push({ label: doc.sliceString(variable_name_node.from, variable_name_node.to), type: "variable" });
        }
        else
            // Functions
            if (IsFunctionDefinition(current_node)) {
                const function_name_node = GetFunctionNameNodeFromDefinition(current_node);
                if (function_name_node)
                    definitions.push({ label: doc.sliceString(function_name_node.from, function_name_node.to), type: "function" });
            }

        // TODO : gather definitions for struts and macros
    })

    if (node.parent)
        definitions = definitions.concat(GetDefinitionsUntil(doc, node.parent, node.from));

    cache.set(node, definitions);

    return definitions;
}

function LocalCompletion(context: CompletionContext): CompletionResult | null {
    const inner_node = syntaxTree(context.state).resolveInner(context.pos, -1);

    const is_word = inner_node.name == "Identifier";
    if (!is_word && !context.explicit) return null;

    // SyntaxTree.resolveInner does not find the closest node to the position, but the innermost one containing it.
    // If the user request for completions explicitly while the cursor is in the middle of whitespace, resolveInner
    // will return the block containing the cursor...
    const is_block = inner_node.name == "Block";

    // ... this is why we are starting the scope scanning in a different way depending on the node type.
    const block = is_block ? inner_node : inner_node.parent;

    // Check if the block is valid : the parent can still be null
    if (block) {
        const definitions = GetDefinitionsUntil(context.state.doc, block, context.pos);
        if (definitions.length != 0)
            return {
                options: definitions,

                // TODO : figure out what the following "from" value does. (cargo-culted for now)
                from: is_word ? inner_node.from : context.pos,

                // Let's just copy this from the javascript example and assume it matches all identifiers
                validFor: /^[\w$\xa1-\uffff][\w$\d\xa1-\uffff]*$/
            };
    }

    return null;
}

// All of the language's keywords
const keyword_completions = (keywords + " " + glsl_keywords).split(" ").map((name: string) => { return { label: name, type: "keyword" } });

// All of the language's primitive types
const primitive_type_completions =

    // Define all basic primitive types
    ["int", "double", "float", "void", "bool", "uint"]

        // Define all vector types
        .concat(["b", "i", "u", "", "d"].map(pref => { return [pref + "vec2", pref + "vec3", pref + "vec4"]; }).flat())

        // Define all matrix types
        .concat(["mat2", "mat3", "mat4"].map(mat_type => { return [mat_type, mat_type + "x2", mat_type + "x3", mat_type + "x4"]; }).flat())

        // Make completion objects out of all the primitive types
        .map(type_name => { return { label: type_name, type: "type" } });

// All builtin constant values (only bool)
const constants = ["true", "false"].map(constant => { return { label: constant, type: "constant" } });

// All builtin functions
const builtin_functions = [
    "radians", "degrees", "sin", "cos", "asin", "acos",
    "pow", "exp", "log", "exp2", "log2", "sqrt", "inversesqrt",
    "abs", "sign", "floor", "trunc", "round", "ceil", "mod", "min", "max", "clamp",
    "length", "dot", "normalize"
].map(fun => { return { label: fun, type: "function" } });

export const autocomplete_extensions = [
    GLSLLanguage.data.of({
        autocomplete: completeFromList(keyword_completions.concat(primitive_type_completions).concat(constants).concat(builtin_functions))
    }),

    GLSLLanguage.data.of({
        autocomplete: LocalCompletion
    })
];