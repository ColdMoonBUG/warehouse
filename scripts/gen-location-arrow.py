# Generate a navigation-app style location arrow icon.
# Blue circle background + white upward arrow + crisp outline.
# Output: apps/mobile-app/src/static/location-arrow.png at 96x96 (transparent bg, no white border).

from PIL import Image, ImageDraw
import os

SIZE = 96
OUT = os.path.join(
    os.path.dirname(__file__), '..', 'apps', 'mobile-app', 'src', 'static', 'location-arrow.png'
)
OUT = os.path.normpath(OUT)

# Render at 4x then downscale for nice anti-aliasing
SCALE = 4
W = SIZE * SCALE
img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

cx = cy = W // 2
# Outer faint halo (very light blue ring, low alpha)
halo_r = int(W * 0.48)
draw.ellipse((cx - halo_r, cy - halo_r, cx + halo_r, cy + halo_r),
             fill=(24, 144, 255, 60))

# White outer ring (gives separation against any map color)
ring_r = int(W * 0.38)
draw.ellipse((cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r),
             fill=(255, 255, 255, 255))

# Solid blue inner circle
inner_r = int(W * 0.34)
draw.ellipse((cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r),
             fill=(24, 144, 255, 255))

# White upward-pointing arrow (triangle) inside the blue
ax = W // 2
ay_top = cy - int(W * 0.20)
ay_bot = cy + int(W * 0.18)
half = int(W * 0.16)
arrow = [
    (ax, ay_top),                # tip
    (ax - half, ay_bot),         # bottom-left
    (ax, ay_bot - int(W * 0.06)),# inner notch (hollow look)
    (ax + half, ay_bot),         # bottom-right
]
draw.polygon(arrow, fill=(255, 255, 255, 255))

# Downscale with high-quality LANCZOS for clean edges
final = img.resize((SIZE, SIZE), Image.LANCZOS)
final.save(OUT, 'PNG', optimize=True)

print(f'Wrote {OUT} ({SIZE}x{SIZE})')
