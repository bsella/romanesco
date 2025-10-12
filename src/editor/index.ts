// @ts-ignore
import { basicSetup } from "codemirror";

import { EditorView, KeyBinding } from "@codemirror/view";
import { keymap } from "@codemirror/view";
import { lintGutter } from "@codemirror/lint";
import { indentWithTab } from "@codemirror/commands";
import { theme, is_dark_mode } from "./themes";
import { GLSL } from "../../glsl_parser/src/index";

export class Editor {
    editor_view;

    private run_callback: (target: EditorView) => boolean;

    constructor(
        parent: HTMLElement,
        initial_program: string | undefined,
        run: (target: EditorView) => boolean,
    ) {
        this.run_callback = run;

        let keymaps: KeyBinding[] = [{ key: "Alt-Enter", run }, indentWithTab];

        this.editor_view = new EditorView({
            doc: initial_program,
            extensions: [
                keymap.of(keymaps),
                lintGutter(),
                basicSetup,
                EditorView.lineWrapping,
                theme,
                GLSL(),
            ],
            parent,
        });

        // Toolbar

        let toolbar_div = document.createElement("div");
        toolbar_div.id = "toolbar";

        toolbar_div.setAttribute("dark", is_dark_mode.toString());

        let run_button = document.createElement("button");
        run_button.id = "run_button";

        // put the run button on the right of the toolbox
        run_button.style.marginLeft = "auto";

        run_button.onclick = () => {
            run(this.editor_view);
        };

        run_button.textContent = "RUN";

        toolbar_div!.appendChild(run_button);

        parent.appendChild(toolbar_div);
    }

    run() {
        return this.run_callback(this.editor_view);
    }
}
