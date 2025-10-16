import { Result } from "typescript-result";
import { Issue } from "../editor/errors";
import { InputHandler } from "./input";

class FragmentShaderUniforms {
    public zoom_location: WebGLUniformLocation;
    public center_pos_location: WebGLUniformLocation;
    public aspect_ratio_location: WebGLUniformLocation;
    public time_location: WebGLUniformLocation;

    constructor(gl: WebGL2RenderingContext, program: WebGLProgram) {
        this.zoom_location = gl.getUniformLocation(program, "u_zoom")!;

        this.center_pos_location = gl.getUniformLocation(
            program,
            "u_center_pos",
        )!;
        this.aspect_ratio_location = gl.getUniformLocation(
            program,
            "u_aspect_ratio",
        )!;
        this.time_location = gl.getUniformLocation(program, "u_time")!;
    }
}

export interface ShaderState {}

export interface ShaderIssues {
    errors: Issue[];
    warnings: Issue[];
}

export class RenderSurface {
    canvas;

    gl: WebGL2RenderingContext;
    program: WebGLProgram;
    frag_shader: WebGLShader;
    vertex_shader: WebGLShader;

    uniforms: FragmentShaderUniforms | null = null;

    aspect_ratio;

    time0 = new Date().getTime();
    previous_time = this.time0;

    frameRate = 30;
    period = 1000.0 / this.frameRate;

    valid = false;
    rendering = false;

    renderTimeoutHandle = 0;

    input;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;

        this.aspect_ratio = this.canvas.width / this.canvas.height;

        let gl = this.canvas.getContext("webgl2");
        if (!gl) {
            throw new Error(
                "Unable to initialize WebGL2. Your browser or machine may not support it.",
            );
        }

        this.gl = gl;

        this.gl.clearColor(1.0, 1.0, 1.0, 1.0);

        this.program = this.gl.createProgram()!;
        this.frag_shader = this.gl.createShader(this.gl.FRAGMENT_SHADER)!;
        this.vertex_shader = this.gl.createShader(this.gl.VERTEX_SHADER)!;

        new ResizeObserver(() => this.resize()).observe(this.canvas);

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
        this.gl.attachShader(this.program, this.frag_shader);

        this.input = new InputHandler(this.canvas);
    }

    invalidate() {
        this.valid = false;
    }

    startRendering() {
        this.renderTimeoutHandle = setTimeout(this.render.bind(this));
    }

    stopRendering() {
        clearTimeout(this.renderTimeoutHandle);
        this.renderTimeoutHandle = 0;
    }

    clear() {
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }

    private render() {
        const current_time = new Date().getTime();

        if (this.uniforms && !this.valid) {
            const time = (current_time - this.time0) / 1000.0;

            this.gl.useProgram(this.program);

            // Upload all the uniforms to the gl program
            this.gl.uniform1f(
                this.uniforms.zoom_location,
                this.input.getZoom(),
            );

            const [center_x, center_y] = this.input.getCenter();

            this.gl.uniform2f(
                this.uniforms.center_pos_location,
                center_x,
                center_y,
            );
            this.gl.uniform1f(
                this.uniforms.aspect_ratio_location,
                this.aspect_ratio,
            );
            this.gl.uniform1f(this.uniforms.time_location, time);

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
        let remaining_time = this.period - frame_time;

        // Not sure what will happen if setTimeout is called with a negative
        // delay, but just to be sure
        if (remaining_time < 0) remaining_time = 0;

        this.previous_time = current_time;

        this.renderTimeoutHandle = setTimeout(
            this.render.bind(this),
            remaining_time,
        );
    }

    private resize() {
        const width = Math.trunc(
            this.canvas.clientWidth * window.devicePixelRatio,
        );
        const height = Math.trunc(
            this.canvas.clientHeight * window.devicePixelRatio,
        );

        if (this.gl.canvas.width != width || this.gl.canvas.height != height) {
            this.gl.canvas.width = width;
            this.gl.canvas.height = height;
            this.gl.viewport(0, 0, width, height);
            this.aspect_ratio = width / height;
        }

        this.invalidate();
    }

    compileFragmentShader(
        shader_src: string,
    ): Result<ShaderState, ShaderIssues> {
        this.gl.shaderSource(this.frag_shader, shader_src);
        this.gl.compileShader(this.frag_shader);

        let errors: Issue[] = [];
        let warnings: Issue[] = [];

        let issues = this.gl.getShaderInfoLog(this.frag_shader)!.split("\n");

        for (let issue of issues) {
            const error_match = issue.match(/ERROR: 0:([0-9]+)(.*)/);

            if (error_match !== null) {
                errors.push({ line: +error_match[1], text: error_match[2] });
            } else {
                const warning_match = issue.match(/WARNING: 0:([0-9]+)(.*)\n/);
                if (warning_match) {
                    warnings.push({
                        line: +warning_match[1],
                        text: warning_match[2],
                    });
                }
            }
        }

        const success = errors.length == 0;

        if (success) {
            this.gl.linkProgram(this.program);
            this.uniforms = new FragmentShaderUniforms(this.gl, this.program);
            return Result.ok({});
        }

        this.uniforms = null;

        return Result.error({ errors, warnings });
    }
}
