#!/usr/bin/env python3
"""Render an aligned BOLD time series over a T1/anatomical background."""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import nibabel as nib
from nibabel.processing import resample_from_to
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bold-aligned", required=True, type=Path)
    parser.add_argument("--anat", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--tr", type=float, default=1.01)
    parser.add_argument("--display-step-vols", type=int, default=2)
    parser.add_argument("--fps", type=float, default=8.0)
    parser.add_argument("--z-threshold", type=float, default=1.2)
    parser.add_argument("--top-percentile", type=float, default=98.8)
    parser.add_argument("--smooth-sigma", type=float, default=0.7)
    parser.add_argument("--title", default="Aligned movie-watching BOLD on T1")
    parser.add_argument("--max-width", type=int, default=1100)
    return parser.parse_args()


def norm_anat(anat: np.ndarray) -> np.ndarray:
    vals = anat[anat > 0]
    lo, hi = np.percentile(vals, [1, 99]) if vals.size else (0, 1)
    return np.clip((anat - lo) / max(hi - lo, 1e-6), 0, 1)


def choose_slices(mask: np.ndarray) -> tuple[list[int], list[int], list[int]]:
    coords = np.argwhere(mask)
    z = np.linspace(np.percentile(coords[:, 2], 30), np.percentile(coords[:, 2], 78), 4).astype(int)
    x = np.linspace(np.percentile(coords[:, 0], 30), np.percentile(coords[:, 0], 70), 2).astype(int)
    y = np.linspace(np.percentile(coords[:, 1], 30), np.percentile(coords[:, 1], 70), 2).astype(int)
    return list(x), list(y), list(z)


def panel(kind: str, idx: int, anat: np.ndarray, zmap: np.ndarray):
    if kind == "axial":
        return np.rot90(anat[:, :, idx]), np.rot90(zmap[:, :, idx]), f"Axial z={idx}"
    if kind == "sag":
        return np.rot90(anat[idx, :, :]), np.rot90(zmap[idx, :, :]), f"Sag x={idx}"
    return np.rot90(anat[:, idx, :]), np.rot90(zmap[:, idx, :]), f"Cor y={idx}"


def render_frame(
    anat: np.ndarray,
    zmap: np.ndarray,
    mask: np.ndarray,
    panels: list[tuple[str, int]],
    time_sec: float,
    args: argparse.Namespace,
) -> Image.Image:
    abs_values = np.abs(zmap[mask])
    threshold = max(args.z_threshold, float(np.percentile(abs_values, args.top_percentile)))
    shown = np.ma.masked_where(np.abs(zmap) < threshold, zmap)

    fig, axes = plt.subplots(2, 4, figsize=(12, 6.4), facecolor="#101214")
    for ax, item in zip(axes.flat, panels):
        bg, ov, title = panel(item[0], item[1], anat, shown)
        ax.imshow(bg, cmap="gray", vmin=0, vmax=1)
        ax.imshow(ov, cmap="coolwarm", vmin=-4, vmax=4, alpha=0.82, interpolation="nearest")
        ax.set_title(title, color="white", fontsize=10)
        ax.axis("off")
    fig.suptitle(f"{args.title} | t = {time_sec:06.1f}s", color="white", fontsize=15)
    fig.text(
        0.5,
        0.035,
        "BOLD frame is affine-aligned to the subject T1; colors show large deviations from this clip mean.",
        color="#cfd3d6",
        ha="center",
        fontsize=9,
    )
    fig.tight_layout(rect=[0.02, 0.06, 0.98, 0.93])
    fig.canvas.draw()
    width, height = fig.canvas.get_width_height()
    arr = np.frombuffer(fig.canvas.buffer_rgba(), dtype=np.uint8).reshape(height, width, 4)
    plt.close(fig)
    img = Image.fromarray(arr[:, :, :3])
    if img.width > args.max_width:
        new_height = int(img.height * args.max_width / img.width)
        img = img.resize((args.max_width, new_height), Image.Resampling.LANCZOS)
    return img


def main() -> None:
    args = parse_args()
    bold_img = nib.load(str(args.bold_aligned))
    anat_img = nib.load(str(args.anat))
    bold = np.asarray(bold_img.get_fdata(), dtype=np.float32)
    if bold.ndim == 3:
        bold = bold[..., None]

    anat_rs = resample_from_to(anat_img, (bold_img.shape[:3], bold_img.affine), order=1)
    anat = norm_anat(np.asarray(anat_rs.get_fdata(), dtype=np.float32))

    mean = bold.mean(axis=3)
    std = bold.std(axis=3)
    positive = mean[mean > 0]
    mask = mean > np.percentile(positive, 35)
    x_slices, y_slices, z_slices = choose_slices(mask)
    panels = [("axial", z) for z in z_slices] + [("sag", x) for x in x_slices] + [("cor", y) for y in y_slices]

    frames = []
    for i in range(bold.shape[3]):
        zmap = (bold[..., i] - mean) / np.maximum(std, 1e-6)
        zmap[~mask] = 0
        if args.smooth_sigma > 0:
            zmap = gaussian_filter(zmap, args.smooth_sigma)
        frames.append(render_frame(anat, zmap, mask, panels, i * args.display_step_vols * args.tr, args))
        if (i + 1) % 10 == 0:
            print(f"Rendered {i + 1}/{bold.shape[3]} frames")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        args.out,
        save_all=True,
        append_images=frames[1:],
        duration=int(round(1000 / args.fps)),
        loop=0,
        optimize=True,
    )
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
