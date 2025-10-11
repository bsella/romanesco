import { Issue } from "./editor/errors";

export class Context {
    output_canvas = document.getElementById("output") as HTMLCanvasElement;

    mouse_down = 0;
    last_mouse_x = 0;
    last_mouse_y = 0;
    last_center_x = 0;
    last_center_y = 0;

    gl = this.output_canvas.getContext("webgl2")!;
    program = this.gl.createProgram()!;
    frag_shader = this.gl.createShader(this.gl.FRAGMENT_SHADER)!;
    vertex_shader = this.gl.createShader(this.gl.VERTEX_SHADER)!;

    zoom_location: WebGLUniformLocation;
    center_pos_location: WebGLUniformLocation;
    aspect_ratio_location: WebGLUniformLocation;
    time_location: WebGLUniformLocation;

    zoom = 2.5;
    center_x = -0.5;
    center_y = 0.0;
    aspect_ratio = this.output_canvas.width / this.output_canvas.height;

    time0 = new Date().getTime();
    previous_time = this.time0;

    frameRate = 30;
    period = 1000.0 / this.frameRate;

    valid = false;
    rendering = false;

    fingers = 0;
    last_fingers_distance: number = 0;
    last_touches: TouchList;

    initGl() {
        if (!this.gl) {
            alert(
                "Unable to initialize WebGL2. Your browser or machine may not support it.",
            );
        }
    }

    createVertexShader() {
        this.gl.shaderSource(
            this.vertex_shader,
            `#version 300 es

	uniform float u_zoom;
	uniform vec2  u_center_pos;
	uniform float u_aspect_ratio;

	out vec2 z0;

	// Instead of using a fullscreen quad, we strech one triangle to cover the whole screen.
	// This method makes it possible to render a fullscreen without using a vertex buffer.
	// No fragments are generated outside of the viewport thanks to clipping.

    //  (-1,3)|\
    //        | \
    //        |  \
    //        |   \
    //  (-1,1)|____\ (1,1)
    //        |####|\
    //        |####| \
    //        |####|  \
    //        |####|   \
    // (-1,-1)|####|____\ (3,-1)
    //             (1,-1)

	void main(){
		vec2 pos;
		switch(gl_VertexID)
		{
			case 0: pos = vec2(-1.0, -1.0); break;
			case 1: pos = vec2(-1.0,  3.0); break;
			case 2: pos = vec2( 3.0, -1.0); break;
		}

		gl_Position = vec4(pos,0.0,1.0);
		z0          = (pos + vec2(1.0)) * 0.5;
		z0.x        = u_center_pos.x + (z0.x * u_zoom - u_zoom * 0.5) * u_aspect_ratio;
		z0.y        = u_center_pos.y +  z0.y * u_zoom - u_zoom * 0.5;
	}`,
        );

        this.gl.compileShader(this.vertex_shader);
        if (
            !this.gl.getShaderParameter(
                this.vertex_shader,
                this.gl.COMPILE_STATUS,
            )
        ) {
            console.error(this.gl.getShaderInfoLog(this.vertex_shader));
        }

        this.gl.attachShader(this.program, this.vertex_shader);
    }

    invalidate() {
        this.valid = false;
    }

    Render() {
        const current_time = new Date().getTime();

        if (!this.valid) {
            const time = (current_time - this.time0) / 1000.0;

            this.gl.useProgram(this.program);

            // Upload all the uniforms to the gl program
            this.gl.uniform1f(this.zoom_location, this.zoom);
            this.gl.uniform2f(
                this.center_pos_location,
                this.center_x,
                this.center_y,
            );
            this.gl.uniform1f(this.aspect_ratio_location, this.aspect_ratio);
            this.gl.uniform1f(this.time_location, time);

            // Render the fullscreen triangle
            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 3);

            // Wait for the GPU to finish rendering the frame
            this.gl.finish();

            this.valid = true;
        }

        // TODO : replace the follwing with whether or not the renderer needs
        // to be continuously rendering (if it's using the time variable)
        this.valid = false;

        // The time it took to render the last frame
        const frame_time = current_time - this.previous_time;

        // Compute the remaining time to catch up with the framerate
        var remaining_time = this.period - frame_time;

        // Not sure what will happen if setTimeout is called with a negative
        // delay, but just to be sure
        if (remaining_time < 0) remaining_time = 0;

        this.previous_time = current_time;
        setTimeout(() => this.Render(), remaining_time);
    }

    resize() {
        var width = Math.trunc(
            this.output_canvas.clientWidth * window.devicePixelRatio,
        );
        var height = Math.trunc(
            this.output_canvas.clientHeight * window.devicePixelRatio,
        );

        if (this.gl.canvas.width != width || this.gl.canvas.height != height) {
            this.gl.canvas.width = width;
            this.gl.canvas.height = height;
            this.gl.viewport(0, 0, width, height);
            this.aspect_ratio = width / height;
        }

        this.invalidate();
    }

    handleEvents() {
        this.output_canvas.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        this.output_canvas.onmousedown = () => {
            if (this.mouse_down == 0) {
                this.last_center_x = this.center_x;
                this.last_center_y = this.center_y;
            }
            this.mouse_down++;
        };

        this.output_canvas.onmouseup = () => {
            this.mouse_down--;
        };
        this.output_canvas.onmouseleave = (e) => {
            if (this.mouse_down > 0) {
                this.output_canvas.onmouseup!(e);
            }
        };
        this.output_canvas.onmouseenter = (e) => {
            if (e.buttons) {
                this.output_canvas.onmousedown!(e);
            }
        };

        this.output_canvas.onmousemove = (e) => {
            if (
                !e.currentTarget ||
                !(e.currentTarget instanceof HTMLCanvasElement)
            ) {
                return;
            }

            const pos = e.currentTarget.getBoundingClientRect();
            var x = (e.clientX - pos.left) * window.devicePixelRatio;
            var y = (e.clientY - pos.top) * window.devicePixelRatio;
            if (this.mouse_down == 0) {
                this.last_mouse_x = x;
                this.last_mouse_y = y;
            } else {
                this.center_x =
                    this.last_center_x +
                    ((this.last_mouse_x - x) / e.currentTarget.width) *
                        this.zoom *
                        this.aspect_ratio;

                this.center_y =
                    this.last_center_y +
                    ((y - this.last_mouse_y) / e.currentTarget.height) *
                        this.zoom;

                this.invalidate();
            }
        };

        this.output_canvas.onwheel = (e) => {
            this.zoom *= 1 + 0.002 * e.deltaY;
            this.invalidate();
        };

        this.output_canvas.ontouchstart = (e) => {
            this.last_center_x = this.center_x;
            this.last_center_y = this.center_y;
            this.last_touches = e.touches;

            this.fingers++;

            if (this.fingers == 2) {
                var x = e.touches[0].pageX - e.touches[1].pageX;
                var y = e.touches[0].pageY - e.touches[1].pageY;
                this.last_fingers_distance = Math.sqrt(x * x + y * y);
            }
        };

        this.output_canvas.ontouchend = (e) => {
            this.last_touches = e.touches;
            this.fingers--;
        };

        this.output_canvas.ontouchmove = (e) => {
            switch (this.fingers) {
                case 1:
                    if (
                        e.currentTarget &&
                        e.currentTarget instanceof HTMLCanvasElement
                    ) {
                        const pos = e.currentTarget.getBoundingClientRect();
                        var x = e.touches[0].pageX - pos.left;
                        var y = e.touches[0].pageY - pos.top;

                        this.center_x =
                            this.last_center_x +
                            ((this.last_touches[0].pageX - x) /
                                e.currentTarget.width) *
                                this.zoom *
                                this.aspect_ratio;
                        this.center_y =
                            this.last_center_y +
                            ((y - this.last_touches[0].pageY) /
                                e.currentTarget.height) *
                                this.zoom;

                        this.invalidate();
                    }
                    break;
                case 2:
                    var x = e.touches[0].pageX - e.touches[1].pageX;
                    var y = e.touches[0].pageY - e.touches[1].pageY;
                    var fingers_distance = Math.sqrt(x * x + y * y);
                    this.zoom *= this.last_fingers_distance / fingers_distance;
                    this.last_fingers_distance = fingers_distance;

                    this.last_touches = e.touches;

                    this.invalidate();
                    break;
                default:
                    break;
            }
        };
    }

    compileFragmentShader(shader_src: string) {
        this.gl.detachShader(this.program, this.frag_shader);
        this.gl.shaderSource(this.frag_shader, shader_src);
        this.gl.compileShader(this.frag_shader);

        let errors: Issue[] = [];
        let warnings: Issue[] = [];

        let issues = this.gl.getShaderInfoLog(this.frag_shader)!.split("\n");

        for (let issue of issues) {
            console.log(issue);
            var error_match = issue.match(/ERROR: 0:([0-9]+)(.*)/);

            if (error_match !== null) {
                errors.push({ line: +error_match[1], text: error_match[2] });
            } else {
                var warning_match = issue.match(/WARNING: 0:([0-9]+)(.*)\n/);
                if (warning_match) {
                    warnings.push({
                        line: +warning_match[1],
                        text: warning_match[2],
                    });
                }
            }
        }

        this.gl.attachShader(this.program, this.frag_shader);
        this.gl.linkProgram(this.program);

        this.zoom_location = this.gl.getUniformLocation(
            this.program,
            "u_zoom",
        )!;

        this.center_pos_location = this.gl.getUniformLocation(
            this.program,
            "u_center_pos",
        )!;
        this.aspect_ratio_location = this.gl.getUniformLocation(
            this.program,
            "u_aspect_ratio",
        )!;
        this.time_location = this.gl.getUniformLocation(
            this.program,
            "u_time",
        )!;

        const success = errors.length == 0;

        if (success) {
            if (!this.rendering) {
                this.Render();
                this.rendering = true;
            }
        } else this.rendering = false;

        return { success, errors, warnings };
    }
}
