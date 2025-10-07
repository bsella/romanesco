import { Issue } from "./editor/errors";

let output_canvas: HTMLCanvasElement = document.getElementById(
    "output",
) as HTMLCanvasElement;

output_canvas.oncontextmenu = function (e) {
    e.preventDefault();
    e.stopPropagation();
};

let gl = output_canvas.getContext("webgl2")!;

if (gl === null) {
    alert(
        "Unable to initialize WebGL2. Your browser or machine may not support it.",
    );
}

let vertex_shader = gl.createShader(gl.VERTEX_SHADER)!;
gl.shaderSource(
    vertex_shader,
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
gl.compileShader(vertex_shader);

let frag_shader = gl.createShader(gl.FRAGMENT_SHADER)!;

let program = gl.createProgram()!;
gl.attachShader(program, vertex_shader);

let zoom_location: WebGLUniformLocation;
let center_pos_location: WebGLUniformLocation;
let aspect_ratio_location: WebGLUniformLocation;
let time_location: WebGLUniformLocation;

export function CompileFragmentShader(shader_src: string) {
    gl.detachShader(program, frag_shader);

    gl.shaderSource(frag_shader, shader_src);
    gl.compileShader(frag_shader);

    let errors: Issue[] = [];
    let warnings: Issue[] = [];

    let issues = gl.getShaderInfoLog(frag_shader)!.split("\n");
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

    gl.attachShader(program, frag_shader);
    gl.linkProgram(program);

    zoom_location = gl.getUniformLocation(program, "u_zoom")!;
    center_pos_location = gl.getUniformLocation(program, "u_center_pos")!;
    aspect_ratio_location = gl.getUniformLocation(program, "u_aspect_ratio")!;
    time_location = gl.getUniformLocation(program, "u_time")!;

    const success = errors.length == 0;

    if (success) {
        if (!rendering) {
            Render();
            rendering = true;
        }
    } else rendering = false;

    return { success: success, errors: errors, warnings: warnings };
}

var zoom = 2.5;
var center_x = -0.5;
var center_y = 0.0;
var aspect_ratio = output_canvas.width / output_canvas.height;

const time0 = new Date().getTime();
var previous_time = time0;

const frameRate = 30;
const period = 1000.0 / frameRate;

var valid = false;
function invalidate() {
    valid = false;
}

var rendering = false;

function Render() {
    const current_time = new Date().getTime();

    if (!valid) {
        const time = (current_time - time0) / 1000.0;

        gl.useProgram(program);

        // Upload all the uniforms to the GL program
        gl.uniform1f(zoom_location, zoom);
        gl.uniform2f(center_pos_location, center_x, center_y);
        gl.uniform1f(aspect_ratio_location, aspect_ratio);
        gl.uniform1f(time_location, time);

        // Render the fullscreen triangle
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3);

        // Wait for the GPU to finish rendering the frame
        gl.finish();

        valid = true;
    }

    // TODO : replace the follwing with whether or not the renderer needs
    // to be continuously rendering (if it's using the time variable)
    valid = false;

    // The time it took to render the last frame
    const frame_time = current_time - previous_time;

    // Compute the remaining time to catch up with the framerate
    var remaining_time = period - frame_time;

    // Not sure what will happen if setTimeout is called with a negative
    // delay, but just to be sure
    if (remaining_time < 0) remaining_time = 0;

    previous_time = current_time;
    setTimeout(Render, remaining_time);
}

function resize() {
    var width = Math.trunc(output_canvas.clientWidth * window.devicePixelRatio);
    var height = Math.trunc(
        output_canvas.clientHeight * window.devicePixelRatio,
    );
    if (gl.canvas.width != width || gl.canvas.height != height) {
        gl.canvas.width = width;
        gl.canvas.height = height;
        gl.viewport(0, 0, width, height);
        aspect_ratio = width / height;
    }
    invalidate();
}
new ResizeObserver(resize).observe(output_canvas);

let mouse_down = 0;
let last_mouse_x: number, last_mouse_y: number;
let last_center_x: number, last_center_y: number;
output_canvas.onmousedown = function (e) {
    if (mouse_down == 0) {
        last_center_x = center_x;
        last_center_y = center_y;
    }
    mouse_down++;
};
output_canvas.onmouseup = function () {
    mouse_down--;
};
output_canvas.onmouseleave = function (e) {
    if (mouse_down > 0) {
        output_canvas.onmouseup!(e);
    }
};
output_canvas.onmouseenter = function (e) {
    if (e.buttons) {
        output_canvas.onmousedown!(e);
    }
};

output_canvas.onmousemove = function (e) {
    if (e.currentTarget && e.currentTarget instanceof HTMLCanvasElement) {
        const pos = e.currentTarget.getBoundingClientRect();
        var x = (e.clientX - pos.left) * window.devicePixelRatio;
        var y = (e.clientY - pos.top) * window.devicePixelRatio;
        if (mouse_down == 0) {
            last_mouse_x = x;
            last_mouse_y = y;
        } else {
            center_x =
                last_center_x +
                ((last_mouse_x - x) / e.currentTarget.width) *
                    zoom *
                    aspect_ratio;
            center_y =
                last_center_y +
                ((y - last_mouse_y) / e.currentTarget.height) * zoom;
            invalidate();
        }
    }
};
output_canvas.onwheel = function (e) {
    zoom *= 1 + 0.002 * e.deltaY;
    invalidate();
};

let fingers = 0;
let last_fingers_distance: number;
let last_touches: TouchList;
output_canvas.ontouchstart = function (e) {
    last_center_x = center_x;
    last_center_y = center_y;
    last_touches = e.touches;

    fingers++;

    if (fingers == 2) {
        var x = e.touches[0].pageX - e.touches[1].pageX;
        var y = e.touches[0].pageY - e.touches[1].pageY;
        last_fingers_distance = Math.sqrt(x * x + y * y);
    }
};

output_canvas.ontouchend = function (e) {
    last_touches = e.touches;
    fingers--;
};

output_canvas.ontouchmove = function (e) {
    switch (fingers) {
        case 1:
            if (
                e.currentTarget &&
                e.currentTarget instanceof HTMLCanvasElement
            ) {
                const pos = e.currentTarget.getBoundingClientRect();
                var x = e.touches[0].pageX - pos.left;
                var y = e.touches[0].pageY - pos.top;

                center_x =
                    last_center_x +
                    ((last_touches[0].pageX - x) / e.currentTarget.width) *
                        zoom *
                        aspect_ratio;
                center_y =
                    last_center_y +
                    ((y - last_touches[0].pageY) / e.currentTarget.height) *
                        zoom;

                invalidate();
            }
            break;
        case 2:
            var x = e.touches[0].pageX - e.touches[1].pageX;
            var y = e.touches[0].pageY - e.touches[1].pageY;
            var fingers_distance = Math.sqrt(x * x + y * y);
            zoom *= last_fingers_distance / fingers_distance;
            last_fingers_distance = fingers_distance;

            last_touches = e.touches;

            invalidate();
            break;
        default:
            break;
    }
};

Render();
