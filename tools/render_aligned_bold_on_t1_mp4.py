#!/usr/bin/env python3
"""Render an aligned BOLD time series over T1 as a real-time MP4."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import nibabel as nib
from nibabel.processing import resample_from_to
import numpy as np
from scipy.ndimage import gaussian_filter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bold-aligned", required=True, type=Path)
    parser.add_argument("--anat", required=True, type=Path)
    parser.add_argument("--mask-anat", type=Path, help="Brain-only anatomical image or mask")
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--frames-dir", type=Path)
    parser.add_argument("--tr", type=float, default=1.01)
    parser.add_argument("--z-threshold", type=float, default=2.0)
    parser.add_argument("--top-percentile", type=float, default=99.5)
    parser.add_argument("--smooth-sigma", type=float, default=0.7)
    parser.add_argument("--positive-only", action="store_true")
    parser.add_argument("--cmap", default="hot")
    parser.add_argument("--vmax", type=float, default=4.0)
    parser.add_argument("--title", default="Movie BOLD dynamics")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--keep-frames", action="store_true")
    return parser.parse_args()


def norm_anat(anat: np.ndarray) -> np.ndarray:
    vals = anat[anat > 0]
    lo, hi = np.percentile(vals, [1, 99]) if vals.size else (0, 1)
    return np.clip((anat - lo) / max(hi - lo, 1e-6), 0, 1)


def choose_panels(mask: np.ndarray) -> list[tuple[str, int]]:
    coords = np.argwhere(mask)
    z = np.linspace(np.percentile(coords[:, 2], 30), np.percentile(coords[:, 2], 78), 4).astype(int)
    x = np.linspace(np.percentile(coords[:, 0], 30), np.percentile(coords[:, 0], 70), 2).astype(int)
    y = np.linspace(np.percentile(coords[:, 1], 30), np.percentile(coords[:, 1], 70), 2).astype(int)
    return [("axial", int(v)) for v in z] + [("sag", int(v)) for v in x] + [("cor", int(v)) for v in y]


def panel(kind: str, idx: int, anat: np.ndarray, zmap):
    if kind == "axial":
        return np.rot90(anat[:, :, idx]), np.rot90(zmap[:, :, idx]), f"Axial z={idx}"
    if kind == "sag":
        return np.rot90(anat[idx, :, :]), np.rot90(zmap[idx, :, :]), f"Sag x={idx}"
    return np.rot90(anat[:, idx, :]), np.rot90(zmap[:, idx, :]), f"Cor y={idx}"


def save_frame(
    frame_path: Path,
    anat: np.ndarray,
    zmap: np.ndarray,
    mask: np.ndarray,
    panels: list[tuple[str, int]],
    frame_idx: int,
    n_frames: int,
    time_sec: float,
    args: argparse.Namespace,
) -> None:
    values = zmap[mask]
    if args.positive_only:
        positive_values = values[values > 0]
        if positive_values.size == 0:
            positive_values = np.array([args.z_threshold], dtype=np.float32)
        threshold = max(args.z_threshold, float(np.percentile(positive_values, args.top_percentile)))
        shown = np.ma.masked_where(zmap < threshold, zmap)
        vmin = threshold
        vmax = max(args.vmax, threshold + 0.5)
        cmap = args.cmap
    else:
        abs_values = np.abs(values)
        threshold = max(args.z_threshold, float(np.percentile(abs_values, args.top_percentile)))
        shown = np.ma.masked_where(np.abs(zmap) < threshold, zmap)
        vmin = -args.vmax
        vmax = args.vmax
        cmap = "coolwarm"

    fig_w = args.width / 100
    fig_h = fig_w * 0.54
    fig, axes = plt.subplots(2, 4, figsize=(fig_w, fig_h), dpi=100, facecolor="#101214")
    for ax, item in zip(axes.flat, panels):
        bg, ov, title = panel(item[0], item[1], anat, shown)
        ax.imshow(bg, cmap="gray", vmin=0, vmax=1)
        ax.imshow(ov, cmap=cmap, vmin=vmin, vmax=vmax, alpha=0.88, interpolation="nearest")
        ax.set_title(title, color="white", fontsize=10)
        ax.axis("off")

    mm = int(time_sec // 60)
    ss = int(round(time_sec - mm * 60))
    fig.suptitle(
        f"{args.title} | {mm:02d}:{ss:02d} | frame {frame_idx + 1}/{n_frames}",
        color="white",
        fontsize=15,
    )
    fig.text(
        0.5,
        0.035,
        "Yellow/red = strongest positive BOLD deviation from this run's mean; brain mask hides eyes and non-brain tissue.",
        color="#cfd3d6",
        ha="center",
        fontsize=9,
    )
    fig.tight_layout(rect=[0.02, 0.06, 0.98, 0.93])
    fig.savefig(frame_path, facecolor=fig.get_facecolor())
    plt.close(fig)


def main() -> None:
    args = parse_args()
    bold_img = nib.load(str(args.bold_aligned))
    anat_img = nib.load(str(args.anat))
    bold = np.asarray(bold_img.get_fdata(), dtype=np.float32)
    if bold.ndim == 3:
        bold = bold[..., None]

    anat_rs = resample_from_to(anat_img, (bold_img.shape[:3], bold_img.affine), order=1)
    anat = norm_anat(np.asarray(anat_rs.get_fdata(), dtype=np.float32))
    external_mask = None
    if args.mask_anat:
        mask_img = nib.load(str(args.mask_anat))
        mask_rs = resample_from_to(mask_img, (bold_img.shape[:3], bold_img.affine), order=0)
        external_mask = np.asarray(mask_rs.get_fdata(), dtype=np.float32) > 0
        anat = np.where(external_mask, anat, 0)

    mean = bold.mean(axis=3)
    std = bold.std(axis=3)
    positive = mean[mean > 0]
    mask = mean > np.percentile(positive, 35)
    if external_mask is not None:
        mask &= external_mask
    panels = choose_panels(mask)

    frames_dir = args.frames_dir or args.out.with_suffix("").parent / f"{args.out.stem}_frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    for old in frames_dir.glob("frame_*.png"):
        old.unlink()

    n_frames = bold.shape[3]
    for i in range(n_frames):
        zmap = (bold[..., i] - mean) / np.maximum(std, 1e-6)
        zmap[~mask] = 0
        if args.smooth_sigma > 0:
            zmap = gaussian_filter(zmap, args.smooth_sigma)
        save_frame(
            frames_dir / f"frame_{i:04d}.png",
            anat,
            zmap,
            mask,
            panels,
            i,
            n_frames,
            i * args.tr,
            args,
        )
        if (i + 1) % 50 == 0 or i == n_frames - 1:
            print(f"Rendered {i + 1}/{n_frames} frames")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            f"{1 / args.tr:.8f}",
            "-i",
            str(frames_dir / "frame_%04d.png"),
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-r",
            "30",
            "-pix_fmt",
            "yuv420p",
            "-c:v",
            "libx264",
            "-crf",
            "20",
            "-preset",
            "medium",
            str(args.out),
        ],
        check=True,
    )
    print(f"Wrote {args.out}")

    if not args.keep_frames:
        for frame in frames_dir.glob("frame_*.png"):
            frame.unlink()
        try:
            frames_dir.rmdir()
        except OSError:
            pass


if __name__ == "__main__":
    main()
