import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const SELECTOR_NODE = "ComfyUIMangaPanelSelector";
const RESOLUTION_NODE = "ComfyUIMangaPanelResolution";
const MIN_PANEL_SIZE = 4;
const HANDLE_RADIUS = 10;

function findWidget(node, name) {
    return node.widgets?.find((widget) => widget.name === name);
}

function widgetNumber(node, name) {
    return Number(findWidget(node, name)?.value ?? 0);
}

function setWidgetNumber(node, name, value) {
    const widget = findWidget(node, name);
    if (!widget) return;
    const rounded = Math.round(value);
    if (widget.value === rounded) return;
    widget.value = rounded;
    widget.callback?.(rounded);
}

function setSelection(node, selection, image) {
    let { x, y, width, height } = selection;
    if (image) {
        x = Math.max(0, Math.min(x, image.naturalWidth));
        y = Math.max(0, Math.min(y, image.naturalHeight));
        width = Math.max(0, Math.min(width, image.naturalWidth - x));
        height = Math.max(0, Math.min(height, image.naturalHeight - y));
    }
    setWidgetNumber(node, "x", x);
    setWidgetNumber(node, "y", y);
    setWidgetNumber(node, "width", width);
    setWidgetNumber(node, "height", height);
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty?.(true, true);
}

function getSelection(node) {
    return {
        x: widgetNumber(node, "x"),
        y: widgetNumber(node, "y"),
        width: widgetNumber(node, "width"),
        height: widgetNumber(node, "height"),
    };
}

function loadImage(editor, url) {
    if (!url || editor.sourceUrl === url) return;
    editor.sourceUrl = url;
    editor.status.textContent = "Loading image...";
    const image = new Image();
    image.onload = () => {
        editor.image = image;
        editor.status.textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
        const selection = getSelection(editor.node);
        if (selection.width < 1 || selection.height < 1 || selection.x >= image.naturalWidth || selection.y >= image.naturalHeight) {
            setSelection(editor.node, { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }, image);
        } else {
            setSelection(editor.node, selection, image);
        }
        editor.draw();
    };
    image.onerror = () => {
        editor.image = null;
        editor.status.textContent = "Failed to load image";
        editor.draw();
    };
    image.src = url;
}

function viewUrl(params) {
    return api.apiURL(`/view?${new URLSearchParams(params).toString()}`);
}

function loadConnectedInputImage(editor) {
    const input = editor.node.inputs?.find((slot) => slot.name === "image");
    if (input?.link == null) return false;
    const link = app.graph?.links?.[input.link];
    const origin = link ? app.graph.getNodeById(link.origin_id) : null;
    if (!origin || origin.type !== "LoadImage") return false;

    const imageWidget = findWidget(origin, "image");
    if (!imageWidget?.value) return false;
    let filename = String(imageWidget.value).replace(/\s+\[(input|output|temp)\]$/, "").replaceAll("\\", "/");
    const separator = filename.lastIndexOf("/");
    const subfolder = separator >= 0 ? filename.slice(0, separator) : "";
    filename = separator >= 0 ? filename.slice(separator + 1) : filename;
    loadImage(editor, viewUrl({ filename, subfolder, type: "input" }));
    return true;
}

function createEditor(node) {
    const root = document.createElement("div");
    root.style.cssText = "width:100%;height:100%;min-height:330px;display:flex;flex-direction:column;gap:6px;overflow:hidden;padding:4px;box-sizing:border-box;";

    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;align-items:center;gap:6px;font:12px sans-serif;color:var(--input-text,#ddd);";
    const status = document.createElement("span");
    status.textContent = "Connect a Load Image node";
    status.style.cssText = "flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    const fullButton = document.createElement("button");
    fullButton.textContent = "Full Image";
    const clearButton = document.createElement("button");
    clearButton.textContent = "Clear Selection";
    for (const button of [fullButton, clearButton]) {
        button.type = "button";
        button.style.cssText = "border:1px solid #666;border-radius:4px;background:#333;color:#eee;padding:3px 7px;cursor:pointer;";
    }
    toolbar.append(status, fullButton, clearButton);

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:300px;min-height:240px;flex:1;background:#181818;border:1px solid #555;border-radius:4px;touch-action:none;cursor:crosshair;";
    root.append(toolbar, canvas);

    const editor = {
        node,
        root,
        canvas,
        status,
        image: null,
        sourceUrl: "",
        drag: null,
        transform: null,
        draw: () => drawEditor(editor),
    };

    fullButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!editor.image) return;
        setSelection(node, { x: 0, y: 0, width: editor.image.naturalWidth, height: editor.image.naturalHeight }, editor.image);
        editor.draw();
    });
    clearButton.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelection(node, { x: 0, y: 0, width: 0, height: 0 }, editor.image);
        editor.status.textContent = "No selection: drag to select a panel";
        editor.draw();
    });

    canvas.addEventListener("pointerdown", (event) => pointerDown(editor, event));
    canvas.addEventListener("pointermove", (event) => pointerMove(editor, event));
    canvas.addEventListener("pointerup", (event) => pointerUp(editor, event));
    canvas.addEventListener("pointercancel", (event) => pointerUp(editor, event));

    const resizeObserver = new ResizeObserver(() => editor.draw());
    resizeObserver.observe(root);
    editor.cleanup = () => resizeObserver.disconnect();
    return editor;
}

function createResolutionDisplay(node) {
    const root = document.createElement("div");
    root.style.cssText = "width:100%;height:42px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;box-sizing:border-box;border:1px solid #666;border-radius:5px;background:#202020;font:12px sans-serif;color:#bbb;";
    const label = document.createElement("span");
    label.textContent = "Calculated Resolution";
    const value = document.createElement("strong");
    value.textContent = "Not calculated";
    value.style.cssText = "color:#fff;font-size:14px;white-space:nowrap;";
    root.append(label, value);
    node.__mangaResolutionValue = value;
    return root;
}

function drawEditor(editor) {
    const { canvas, image } = editor;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * pixelRatio);
    const height = Math.round(rect.height * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, rect.width, rect.height);
    if (!image) {
        ctx.fillStyle = "#aaa";
        ctx.font = "13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Connect Load Image or queue once", rect.width / 2, rect.height / 2);
        editor.transform = null;
        return;
    }

    const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const left = (rect.width - drawWidth) / 2;
    const top = (rect.height - drawHeight) / 2;
    editor.transform = { left, top, scale, width: drawWidth, height: drawHeight };
    ctx.drawImage(image, left, top, drawWidth, drawHeight);

    const selection = getSelection(editor.node);
    if (selection.width < 1 || selection.height < 1) return;
    const sx = left + selection.x * scale;
    const sy = top + selection.y * scale;
    const sw = selection.width * scale;
    const sh = selection.height * scale;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
    ctx.beginPath();
    ctx.rect(left, top, drawWidth, drawHeight);
    ctx.rect(sx, sy, sw, sh);
    ctx.fill("evenodd");
    ctx.strokeStyle = "#ff3434";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#ff3434";
    for (const [hx, hy] of [[sx, sy], [sx + sw, sy], [sx + sw, sy + sh], [sx, sy + sh]]) {
        ctx.beginPath();
        ctx.rect(hx - 4, hy - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.fillRect(sx, Math.max(top, sy - 20), Math.max(105, Math.min(sw, 160)), 20);
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${selection.width} × ${selection.height}`, sx + 5, Math.max(top + 14, sy - 6));
    ctx.restore();
}

function canvasPoint(editor, event) {
    const rect = editor.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function imagePoint(editor, event) {
    const point = canvasPoint(editor, event);
    const transform = editor.transform;
    if (!transform || !editor.image) return null;
    return {
        x: Math.max(0, Math.min(editor.image.naturalWidth, (point.x - transform.left) / transform.scale)),
        y: Math.max(0, Math.min(editor.image.naturalHeight, (point.y - transform.top) / transform.scale)),
    };
}

function hitTest(editor, event) {
    const point = canvasPoint(editor, event);
    const selection = getSelection(editor.node);
    const transform = editor.transform;
    if (!transform || selection.width < 1 || selection.height < 1) return "create";
    const left = transform.left + selection.x * transform.scale;
    const top = transform.top + selection.y * transform.scale;
    const right = left + selection.width * transform.scale;
    const bottom = top + selection.height * transform.scale;
    const handles = { nw: [left, top], ne: [right, top], se: [right, bottom], sw: [left, bottom] };
    for (const [name, [x, y]] of Object.entries(handles)) {
        if (Math.hypot(point.x - x, point.y - y) <= HANDLE_RADIUS) return name;
    }
    if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) return "move";
    return "create";
}

function pointerDown(editor, event) {
    if (!editor.image || !editor.transform) return;
    const point = imagePoint(editor, event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    editor.canvas.setPointerCapture(event.pointerId);
    editor.drag = { mode: hitTest(editor, event), start: point, initial: getSelection(editor.node) };
}

function pointerMove(editor, event) {
    if (!editor.drag) return;
    const point = imagePoint(editor, event);
    if (!point) return;
    event.preventDefault();
    const { mode, start, initial } = editor.drag;
    let selection;
    if (mode === "create") {
        selection = {
            x: Math.min(start.x, point.x),
            y: Math.min(start.y, point.y),
            width: Math.abs(point.x - start.x),
            height: Math.abs(point.y - start.y),
        };
    } else if (mode === "move") {
        const x = Math.max(0, Math.min(editor.image.naturalWidth - initial.width, initial.x + point.x - start.x));
        const y = Math.max(0, Math.min(editor.image.naturalHeight - initial.height, initial.y + point.y - start.y));
        selection = { ...initial, x, y };
    } else {
        let left = initial.x;
        let top = initial.y;
        let right = initial.x + initial.width;
        let bottom = initial.y + initial.height;
        if (mode.includes("n")) top = point.y;
        if (mode.includes("s")) bottom = point.y;
        if (mode.includes("w")) left = point.x;
        if (mode.includes("e")) right = point.x;
        selection = {
            x: Math.min(left, right),
            y: Math.min(top, bottom),
            width: Math.abs(right - left),
            height: Math.abs(bottom - top),
        };
    }
    setSelection(editor.node, selection, editor.image);
    editor.status.textContent = `${Math.round(selection.width)} × ${Math.round(selection.height)} / x:${Math.round(selection.x)} y:${Math.round(selection.y)}`;
    editor.draw();
}

function pointerUp(editor, event) {
    if (!editor.drag) return;
    event.preventDefault();
    const selection = getSelection(editor.node);
    if (selection.width < MIN_PANEL_SIZE || selection.height < MIN_PANEL_SIZE) {
        setSelection(editor.node, { x: 0, y: 0, width: 0, height: 0 }, editor.image);
        editor.status.textContent = "Selection is too small";
    } else {
        editor.status.textContent = `${selection.width} × ${selection.height} / x:${selection.x} y:${selection.y}`;
    }
    editor.drag = null;
    if (editor.canvas.hasPointerCapture(event.pointerId)) editor.canvas.releasePointerCapture(event.pointerId);
    editor.draw();
}

app.registerExtension({
    name: "ComfyUI.MangaPanel",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name === RESOLUTION_NODE) {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = onNodeCreated?.apply(this, arguments);
                const display = createResolutionDisplay(this);
                this.addDOMWidget("generation_resolution_display", "MANGA_RESOLUTION_DISPLAY", display, {
                    serialize: false,
                    hideOnZoom: false,
                    getMinHeight: () => 42,
                    getMaxHeight: () => 42,
                });
                this.setSize([Math.max(this.size?.[0] ?? 0, 310), Math.max(this.size?.[1] ?? 0, 292)]);
                return result;
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                const result = onExecuted?.apply(this, arguments);
                const resolution = message?.generation_resolution?.[0];
                if (resolution && this.__mangaResolutionValue) this.__mangaResolutionValue.textContent = resolution;
                return result;
            };
            return;
        }
        if (nodeData?.name !== SELECTOR_NODE) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            const editor = createEditor(this);
            this.__mangaPanelEditor = editor;
            this.addDOMWidget("panel_editor", "MANGA_PANEL_EDITOR", editor.root, {
                serialize: false,
                hideOnZoom: false,
                getMinHeight: () => 330,
                getMaxHeight: () => 600,
            });
            const width = Math.max(this.size?.[0] ?? 0, 430);
            const height = Math.max(this.size?.[1] ?? 0, 520);
            this.setSize([width, height]);
            setTimeout(() => loadConnectedInputImage(editor), 0);
            return result;
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const result = onConnectionsChange?.apply(this, arguments);
            setTimeout(() => this.__mangaPanelEditor && loadConnectedInputImage(this.__mangaPanelEditor), 0);
            return result;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const result = onExecuted?.apply(this, arguments);
            const image = message?.images?.[0];
            if (image && this.__mangaPanelEditor) loadImage(this.__mangaPanelEditor, viewUrl(image));
            return result;
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            this.__mangaPanelEditor?.cleanup?.();
            return onRemoved?.apply(this, arguments);
        };
    },
});
