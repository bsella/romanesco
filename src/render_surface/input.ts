export class InputHandler {
    private zoom = 2.5;
    private center_x = -0.5;
    private center_y = 0.0;

    private mouse_down = 0;
    private last_mouse_x = 0;
    private last_mouse_y = 0;
    private last_center_x = 0;
    private last_center_y = 0;

    private fingers = 0;
    private last_fingers_distance: number = 0;
    private last_touches: TouchList | null = null;

    constructor(canvas: HTMLElement) {
        canvas.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        canvas.onmousedown = () => {
            if (this.mouse_down == 0) {
                this.last_center_x = this.center_x;
                this.last_center_y = this.center_y;
            }
            this.mouse_down++;
        };

        canvas.onmouseup = () => {
            this.mouse_down--;
        };

        canvas.onmouseleave = (e) => {
            if (this.mouse_down > 0) {
                canvas.onmouseup!(e);
            }
        };
        canvas.onmouseenter = (e) => {
            if (e.buttons) {
                canvas.onmousedown!(e);
            }
        };

        canvas.onmousemove = (e) => {
            if (
                !e.currentTarget ||
                !(e.currentTarget instanceof HTMLCanvasElement)
            ) {
                return;
            }

            const pos = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - pos.left) * window.devicePixelRatio;
            const y = (e.clientY - pos.top) * window.devicePixelRatio;
            if (this.mouse_down == 0) {
                this.last_mouse_x = x;
                this.last_mouse_y = y;
            } else {
                const aspect_ratio =
                    e.currentTarget.width / e.currentTarget.height;

                this.center_x =
                    this.last_center_x +
                    ((this.last_mouse_x - x) / e.currentTarget.width) *
                        this.zoom *
                        aspect_ratio;

                this.center_y =
                    this.last_center_y +
                    ((y - this.last_mouse_y) / e.currentTarget.height) *
                        this.zoom;
            }
        };

        canvas.onwheel = (e) => {
            this.zoom *= 1 + 0.002 * e.deltaY;
        };

        canvas.ontouchstart = (e) => {
            this.last_center_x = this.center_x;
            this.last_center_y = this.center_y;
            this.last_touches = e.touches;

            this.fingers++;

            if (this.fingers == 2) {
                const x = e.touches[0].pageX - e.touches[1].pageX;
                const y = e.touches[0].pageY - e.touches[1].pageY;
                this.last_fingers_distance = Math.sqrt(x * x + y * y);
            }
        };

        canvas.ontouchend = (e) => {
            this.last_touches = e.touches;
            this.fingers--;
        };

        canvas.ontouchmove = (e) => {
            switch (this.fingers) {
                case 1:
                    if (
                        this.last_touches &&
                        e.currentTarget &&
                        e.currentTarget instanceof HTMLCanvasElement
                    ) {
                        const pos = e.currentTarget.getBoundingClientRect();
                        const x = e.touches[0].pageX - pos.left;
                        const y = e.touches[0].pageY - pos.top;

                        const aspect_ratio =
                            e.currentTarget.width / e.currentTarget.height;

                        this.center_x =
                            this.last_center_x +
                            ((this.last_touches[0].pageX - x) /
                                e.currentTarget.width) *
                                this.zoom *
                                aspect_ratio;
                        this.center_y =
                            this.last_center_y +
                            ((y - this.last_touches[0].pageY) /
                                e.currentTarget.height) *
                                this.zoom;
                    }
                    break;
                case 2:
                    const x = e.touches[0].pageX - e.touches[1].pageX;
                    const y = e.touches[0].pageY - e.touches[1].pageY;
                    const fingers_distance = Math.sqrt(x * x + y * y);
                    this.zoom *= this.last_fingers_distance / fingers_distance;
                    this.last_fingers_distance = fingers_distance;

                    this.last_touches = e.touches;

                    break;
                default:
                    break;
            }
        };
    }

    getZoom() {
        return this.zoom;
    }
    getCenter() {
        return [this.center_x, this.center_y];
    }
}
