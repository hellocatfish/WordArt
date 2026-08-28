# -*- coding: utf-8 -*-
"""生成 backend 自测用的演示图(径向球体 / LOVE 字 / 渐变心形)。"""
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = r"D:\202609_Exercise\1_hackathon\WordArt\backend\assets\demo"
FONT = r"C:\Windows\Fonts\simhei.ttf"

import os
os.makedirs(OUT, exist_ok=True)

# ---------- 1. 径向渐变球体(模拟人像/合影的明暗层次) ----------
W, H = 900, 640
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
cx, cy, r = W * 0.5, H * 0.46, min(W, H) * 0.40
d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
lum = np.zeros((H, W), dtype=np.float32)
inside = d < r
lum[inside] = np.clip(235 * (1 - (d / r) ** 1.6), 0, 255)[inside]
# 左上高光,模拟光源
hl = np.sqrt((xx - (cx - r * 0.35)) ** 2 + (yy - (cy - r * 0.4)) ** 2)
lum = np.clip(lum + 55 * np.exp(-(hl / (r * 0.45)) ** 2), 0, 255)
lum[~inside] = 0
Image.fromarray(lum.astype(np.uint8)).convert("RGB").save(f"{OUT}\\sphere.png")

# ---------- 2. LOVE 字(模拟 logo:白底黑字) ----------
W, H = 1200, 600
img = Image.new("RGB", (W, H), "white")
draw = ImageDraw.Draw(img)
font = ImageFont.truetype(FONT, 380)
draw.text((W / 2, H / 2), "LOVE", font=font, fill=(20, 20, 20), anchor="mm")
img.save(f"{OUT}\\love.png")

# ---------- 3. 渐变心形(模拟吉祥物:白底红心,顶部亮) ----------
W, H = 800, 720
t = np.linspace(0, 2 * np.pi, 600)
hx = 16 * np.sin(t) ** 3
hy = -(13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t))
scale = W * 0.44 / 17
pts = list(zip((W / 2 + hx * scale).tolist(), (H / 2 + hy * scale).tolist()))
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).polygon(pts, fill=255)
m = np.asarray(mask, dtype=np.float32) / 255.0
# 径向亮度调制:顶部偏亮,底部偏暗,出现明暗层次
dist = np.sqrt(((xx2 := np.mgrid[0:H, 0:W][1]) - W * 0.5) ** 2 + (np.mgrid[0:H, 0:W][0] - H * 0.42) ** 2)
shade = np.clip(1.05 - dist / (W * 0.55), 0.55, 1.0)
red = np.zeros((H, W, 3), dtype=np.float32)
for i, base in enumerate((225, 55, 75)):
    red[..., i] = base * shade
out = np.full((H, W, 3), 255.0, dtype=np.float32)
out = out * (1 - m[..., None]) + red * m[..., None]
Image.fromarray(out.astype(np.uint8)).save(f"{OUT}\\heart.png")

print("demo assets saved:", os.listdir(OUT))
