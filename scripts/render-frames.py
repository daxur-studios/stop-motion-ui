#!/usr/bin/env python3
"""Rasterizes a frame-plan.json (see build-frame-plan.mjs) into a numbered PNG
sequence, using Pillow as the headless rasterizer in place of a real <canvas>
(no browser/node-canvas/sharp available in this sandbox — see
docs/adr/ADR-009-video-export.md for why).

Draw order and visual parameters are ported from replay/player.js's render(),
drawRipples(), and drawCursor() — same order, same colors/sizes, just PIL
ImageDraw calls instead of canvas 2D calls:
  1. black fill
  2. frame's screenshot (for asyncWait frames, this is already a full-screen
     screenshot, not a region crop to composite — see ADR-010, which removed
     an earlier region-crop-over-base-frame version of this)
  3. ripples (stroked circles, fading alpha)
  4. cursor: orbit guide (dashed circle) -> shadow -> arrow polygon

Usage:
  python3 scripts/render-frames.py <scenario-dir> <out-dir>
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw


def load_cached(cache, base_dir, rel_path):
    if rel_path not in cache:
        cache[rel_path] = Image.open(os.path.join(base_dir, rel_path)).convert("RGBA")
    return cache[rel_path]


def draw_dashed_circle(draw, cx, cy, r, color, width=1.5, dash=4, gap=4):
    # PIL has no native dashed-stroke primitive; approximate by stroking short
    # arcs around the circle, alternating dash/gap by arc length. Matches
    # player.js's ctx.setLineDash([4, 4]) closely enough for an orbit guide.
    circumference = 2 * math.pi * r
    if circumference < 1:
        return
    dash_deg = (dash / circumference) * 360
    gap_deg = (gap / circumference) * 360
    angle = 0.0
    bbox = [cx - r, cy - r, cx + r, cy + r]
    while angle < 360:
        draw.arc(bbox, angle, angle + dash_deg, fill=color, width=max(1, round(width)))
        angle += dash_deg + gap_deg


def draw_cursor(draw, x, y, orbit):
    if orbit:
        draw_dashed_circle(
            draw, orbit["center"]["x"], orbit["center"]["y"], orbit["radius"],
            (255, 210, 70, 140),  # rgba(255,210,70,0.55) -> alpha 0.55*255≈140
            width=1.5,
        )

    # Soft shadow.
    draw.ellipse(
        [x + 1.5 - 7, y + 2.5 - 7, x + 1.5 + 7, y + 2.5 + 7],
        fill=(0, 0, 0, 89),  # 0.35*255≈89
    )

    # Cursor arrow polygon (vertices ported verbatim from drawCursor()).
    pts = [
        (x + 0, y + 0),
        (x + 0, y + 16),
        (x + 4, y + 12.5),
        (x + 7, y + 19),
        (x + 9.5, y + 17.7),
        (x + 6.7, y + 11.3),
        (x + 11.5, y + 11.3),
    ]
    draw.polygon(pts, fill=(255, 255, 255, 255), outline=(34, 34, 34, 255))


def draw_ripples(draw, ripples):
    for rp in ripples:
        alpha = max(0, min(255, round(rp["alpha"] * 255)))
        color = (120, 200, 255, alpha)
        r = rp["r"]
        x, y = rp["x"], rp["y"]
        draw.ellipse([x - r, y - r, x + r, y + r], outline=color, width=2)


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/render-frames.py <scenario-dir> <out-dir>", file=sys.stderr)
        sys.exit(1)

    scenario_dir = sys.argv[1]
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)

    with open(os.path.join(scenario_dir, "frame-plan.json")) as f:
        plan = json.load(f)

    vw, vh = plan["viewport"]["width"], plan["viewport"]["height"]
    cache = {}

    for i, frame in enumerate(plan["frames"]):
        canvas = Image.new("RGBA", (vw, vh), (0, 0, 0, 255))

        base = load_cached(cache, scenario_dir, frame["screenshot"])
        if base.size != (vw, vh):
            base = base.resize((vw, vh))
        canvas.alpha_composite(base)

        draw = ImageDraw.Draw(canvas, "RGBA")
        draw_ripples(draw, frame["ripples"])
        draw_cursor(draw, frame["cursor"]["x"], frame["cursor"]["y"], frame["orbit"])

        out_path = os.path.join(out_dir, f"frame_{i:05d}.png")
        canvas.convert("RGB").save(out_path)

        if i % 30 == 0 or i == len(plan["frames"]) - 1:
            print(f"rendered {i + 1}/{len(plan['frames'])}")

    print(f"Done: {len(plan['frames'])} frames written to {out_dir}")


if __name__ == "__main__":
    main()
