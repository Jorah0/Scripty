"""Render the Scripty logo to build/icon.png, build/icon.ico and assets/icon.png (run: npm run icon)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
S = 1024
STOPS = [(0.0, (124, 92, 255)), (0.55, (184, 77, 240)), (1.0, (255, 92, 138))]


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def grad(t):
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            return lerp(c0, c1, (t - t0) / (t1 - t0))
    return STOPS[-1][1]


def render():
    # diagonal gradient
    g = Image.new("RGB", (S, S))
    px = g.load()
    row = [grad(i / (2 * S - 2)) for i in range(2 * S - 1)]
    for y in range(S):
        for x in range(S):
            px[x, y] = row[x + y]
    mask = Image.new("L", (S, S), 0)
    pad = 40
    ImageDraw.Draw(mask).rounded_rectangle((pad, pad, S - pad, S - pad), radius=230, fill=255)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(g, (0, 0), mask)

    # soft top highlight, clipped to the rounded square
    hi = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(hi).ellipse((-200, -620, S + 200, 380), fill=(255, 255, 255, 34))
    img = Image.alpha_composite(img, Image.composite(hi, Image.new("RGBA", (S, S)), mask))
    d = ImageDraw.Draw(img)

    font = None
    for name in ("seguibl.ttf", "segoeuib.ttf", "arialbd.ttf"):
        try:
            font = ImageFont.truetype(str(Path("C:/Windows/Fonts") / name), 640)
            break
        except OSError:
            continue
    font = font or ImageFont.load_default()
    box = d.textbbox((0, 0), "S", font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((S - w) / 2 - box[0] - 50, (S - h) / 2 - box[1] - 10), "S", font=font, fill="white")

    # audio bars bottom-right
    for x, hgt in ((720, 150), (800, 240), (880, 120)):
        d.rounded_rectangle((x, 870 - hgt, x + 50, 870), radius=25, fill=(255, 255, 255, 235))
    return img


if __name__ == "__main__":
    big = render()
    (ROOT / "assets").mkdir(exist_ok=True)
    big.resize((512, 512), Image.LANCZOS).save(ROOT / "build" / "icon.png")
    big.resize((256, 256), Image.LANCZOS).save(ROOT / "assets" / "icon.png")
    big.save(ROOT / "build" / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("icons written")
