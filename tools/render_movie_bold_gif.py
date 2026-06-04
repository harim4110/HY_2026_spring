#!/usr/bin/env python3
"""Render a lecture-friendly animated BOLD overlay from a 4D NIfTI file.

The output is intentionally visual, not a substitute for model-based fMRI
analysis. It highlights voxels with strong moment-to-moment deviation from the
run mean and overlays them on the mean EPI.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import nibabel as nib
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bold", required=True, type=Path, help="4D BOLD NIfTI")
    parser.add_argument("--json", type=Path, help="Sidecar JSON with RepetitionTime")
    parser.add_argument("--out", required=True, type=Path, help="Output GIF path")
    parser.add_argument("--start-sec", type=float, default=0.0)
    parser.add_argument("--duration-sec", type=float, default=120.0)
    parser.add_argument("--display-step-sec", type=float, default=2.02)
    parser.add_argument("--fps", type=float, default=8.0)
    parser.add_argument("--z-threshold", type=float, default=1.5)
    parser.add_argument("--top-percentile", type=float, default=99.2)
    parser.add_argument("--smooth-sigma", type=float, default=0.8)
    parser.add_argument("--slices", nargs="+", type=int, default=[18, 24, 30, 36, 42, 48])
    parser.add_argument("--title", default="Movie watching BOLD dynamics")
    parser.add_argument("--max-width", type=int, default=1100)
    return parser.parse_args()


def repetition_time(bold: Path, sidecar: Path | None, header) -> float:
    if sidecar and sidecar.exists():
        with sidecar.open() as f:
            value = json.load(f).get("RepetitionTime")
            if value:
                return float(value)
    zooms = header.get_zooms()
    if len(zooms) >= 4:
        return float(zooms[3])
    raise ValueError("Could not determine TR from JSON or NIfTI header")


def running_mean_std(dataobj, volumes: range) -> tuple[np.ndarray, np.ndarray]:
    mean = None
    m2 = None
    n = 0
    for t in volumes:
        vol = np.asarray(dataobj[..., t], dtype=np.float32)
        if mean is None:
            mean = np.zeros_like(vol, dtype=np.float32)
            m2 = np.zeros_like(vol, dtype=np.float32)
        n += 1
        delta = vol - mean
        mean += delta / n
        m2 += delta * (vol - mean)
    if mean is None or m2 is None or n < 2:
        raise ValueError("Need at least two volumes to estimate temporal variance")
    var = m2 / (n - 1)
    std = np.sqrt(np.maximum(var, 1e-6)).astype(np.float32)
    return mean, std


def normalize_base(mean: np.ndarray, mask: np.ndarray) -> np.ndarray:
    values = mean[mask]
    lo, hi = np.percentile(values, [2, 98])
    base = (mean - lo) / max(hi - lo, 1e-6)
    return np.clip(base, 0, 1)


def make_mask(mean: np.ndarray) -> np.ndarray:
    positive = mean[mean > 0]
    if positive.size == 0:
        return np.ones(mean.shape, dtype=bool)
    cutoff = np.percentile(positive, 35)
    mask = mean > cutoff
    return gaussian_filter(mask.astype(np.float32), 0.6) > 0.4


def render_frame(
    base: np.ndarray,
    zmap: np.ndarray,
    mask: np.ndarray,
    slices: list[int],
    time_sec: float,
    title: str,
    z_threshold: float,
    top_percentile: float,
    max_width: int,
) -> Image.Image:
    abs_values = np.abs(zmap[mask])
    frame_threshold = max(z_threshold, float(np.percentile(abs_values, top_percentile)))
    overlay = np.ma.masked_where(np.abs(zmap) < frame_threshold, zmap)

    fig, axes = plt.subplots(2, 3, figsize=(11, 7), facecolor="#101214")
    for ax, sl in zip(axes.flat, slices):
        ax.imshow(np.rot90(base[:, :, sl]), cmap="gray", vmin=0, vmax=1)
        ax.imshow(
            np.rot90(overlay[:, :, sl]),
            cmap="coolwarm",
            vmin=-4,
            vmax=4,
            alpha=0.78,
            interpolation="nearest",
        )
        ax.set_title(f"z={sl}", color="white", fontsize=11)
        ax.axis("off")

    fig.suptitle(f"{title} | t = {time_sec:06.1f}s", color="white", fontsize=16)
    fig.text(
        0.5,
        0.035,
        "Warm/cool colors show large positive/negative BOLD deviations from this run's mean.",
        color="#cfd3d6",
        ha="center",
        fontsize=10,
    )
    fig.tight_layout(rect=[0.02, 0.06, 0.98, 0.94])
    fig.canvas.draw()
    width, height = fig.canvas.get_width_height()
    image = np.frombuffer(fig.canvas.buffer_rgba(), dtype=np.uint8).reshape(height, width, 4)
    plt.close(fig)

    pil = Image.fromarray(image[:, :, :3])
    if pil.width > max_width:
        new_height = int(pil.height * max_width / pil.width)
        pil = pil.resize((max_width, new_height), Image.Resampling.LANCZOS)
    return pil


def main() -> None:
    args = parse_args()
    img = nib.load(str(args.bold))
    if len(img.shape) != 4:
        raise ValueError(f"Expected 4D BOLD, got shape {img.shape}")

    tr = repetition_time(args.bold, args.json, img.header)
    n_vols = img.shape[3]
    start_vol = max(0, int(round(args.start_sec / tr)))
    stop_vol = min(n_vols, int(round((args.start_sec + args.duration_sec) / tr)))
    display_step = max(1, int(round(args.display_step_sec / tr)))
    stats_volumes = range(start_vol, stop_vol)
    display_volumes = range(start_vol, stop_vol, display_step)

    print(f"Loading {args.bold}")
    print(f"TR={tr:.3f}s, volumes={n_vols}, rendering {start_vol}:{stop_vol}:{display_step}")

    mean, std = running_mean_std(img.dataobj, stats_volumes)
    mask = make_mask(mean)
    base = normalize_base(mean, mask)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    frames = []
    for i, t in enumerate(display_volumes, 1):
        vol = np.asarray(img.dataobj[..., t], dtype=np.float32)
        zmap = (vol - mean) / std
        zmap[~mask] = 0
        if args.smooth_sigma > 0:
            zmap = gaussian_filter(zmap, args.smooth_sigma)
        frame = render_frame(
            base=base,
            zmap=zmap,
            mask=mask,
            slices=args.slices,
            time_sec=t * tr,
            title=args.title,
            z_threshold=args.z_threshold,
            top_percentile=args.top_percentile,
            max_width=args.max_width,
        )
        frames.append(frame)
        if i % 10 == 0:
            print(f"Rendered {i}/{len(range(start_vol, stop_vol, display_step))} frames")

    duration_ms = int(round(1000 / args.fps))
    frames[0].save(
        args.out,
        save_all=True,
        append_images=frames[1:],
        duration=duration_ms,
        loop=0,
        optimize=True,
    )
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
