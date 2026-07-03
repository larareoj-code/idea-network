import { useEffect, useRef, type RefObject } from "react";
import { NODE_COLORS, type GraphViewHandle } from "./GraphView";

const MAP_W = 160;
const MAP_H = 110;

interface Props {
  api: RefObject<GraphViewHandle | null>;
  selectedId: string | null;
  onResetLayout: () => void;
}

export default function GraphControls({ api, selectedId, onResetLayout }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef({ scale: 1, cx: 0, cy: 0 });

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 150) return;
      last = t;
      const canvas = canvasRef.current;
      const data = api.current?.getMinimapData();
      if (!canvas || !data) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, MAP_W, MAP_H);
      if (data.nodes.length === 0) return;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const n of data.nodes) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
      const spanX = maxX - minX || 1;
      const spanY = maxY - minY || 1;
      const scale = Math.min((MAP_W - 12) / spanX, (MAP_H - 12) / spanY);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      transformRef.current = { scale, cx, cy };
      const px = (x: number) => MAP_W / 2 + (x - cx) * scale;
      const py = (y: number) => MAP_H / 2 + (y - cy) * scale;
      for (const n of data.nodes) {
        ctx.fillStyle = NODE_COLORS[n.type];
        ctx.fillRect(px(n.x) - 1, py(n.y) - 1, 2, 2);
      }
      const v = data.viewport;
      ctx.strokeStyle = "rgba(230, 234, 242, 0.75)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px(v.x), py(v.y), v.w * scale, v.h * scale);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [api]);

  const onMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { scale, cx, cy } = transformRef.current;
    if (!scale) return;
    const gx = (e.clientX - rect.left - MAP_W / 2) / scale + cx;
    const gy = (e.clientY - rect.top - MAP_H / 2) / scale + cy;
    api.current?.panTo(gx, gy);
  };

  return (
    <>
      <div className="graph-controls">
        <button className="dock-btn" title="Zoom in" onClick={() => api.current?.zoomIn()}>
          +
        </button>
        <button className="dock-btn" title="Zoom out" onClick={() => api.current?.zoomOut()}>
          −
        </button>
        <button className="dock-btn" title="Fit to screen" onClick={() => api.current?.fitToScreen()}>
          ⛶
        </button>
        <button
          className="dock-btn"
          title="Center on selected"
          disabled={!selectedId}
          onClick={() => selectedId && api.current?.centerOn(selectedId)}
        >
          ◎
        </button>
        <button className="dock-btn" title="Reset layout" onClick={onResetLayout}>
          ↺
        </button>
        <button
          className="dock-btn"
          title="Fullscreen"
          onClick={() => api.current?.toggleFullscreen()}
        >
          ⤢
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="minimap"
        width={MAP_W}
        height={MAP_H}
        onClick={onMapClick}
        title="Overview — click to pan"
      />
    </>
  );
}
