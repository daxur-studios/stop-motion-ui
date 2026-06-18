#!/usr/bin/env python3
"""
Generates the placeholder "screenshots" used by the replay player's test
scenarios. These are not real captures (no real capture has happened yet) —
just simple labeled rectangles/text on solid backgrounds, distinct enough per
frame to make it obvious whether the player is syncing screenshots to the
right point in the timeline.

Regenerate with: python3 generate_placeholders.py
(Requires Pillow: pip install pillow)
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 800
HERE = os.path.dirname(os.path.abspath(__file__))


def font(size):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


F_TITLE = font(40)
F_LABEL = font(22)
F_SMALL = font(16)


def panel(draw, bg, x, y, w, h, fill, label=None, label_font=F_LABEL, text_fill="#111"):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=10, fill=fill, outline="#0003", width=2)
    if label:
        bbox = draw.textbbox((0, 0), label, font=label_font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((x + (w - tw) / 2, y + (h - th) / 2 - bbox[1]), label, font=label_font, fill=text_fill)


def base_page(bg_color, title, subtitle=None):
    img = Image.new("RGB", (W, H), bg_color)
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, W, 88], fill="#1f2430")
    draw.text((40, 24), title, font=F_TITLE, fill="#fff")
    if subtitle:
        draw.text((40, H - 40), subtitle, font=F_SMALL, fill="#8892a0")
    return img, draw


def save(img, scenario, name):
    out_dir = os.path.join(HERE, scenario, "screenshots")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    img.save(path)
    print("wrote", path)


# ---------------------------------------------------------------------------
# Scenario 1 — Dashboard settings
#   navigate -> click "Settings" -> circle "Notifications" heading -> click "Save"
# ---------------------------------------------------------------------------

def scenario_1():
    s = "scenario-1"

    img, d = base_page("#eef1f6", "Dashboard", "fake capture — scenario 1, frame 1/3")
    panel(d, img, 40, 130, 360, 160, "#ffffff", "Usage this week")
    panel(d, img, 430, 130, 360, 160, "#ffffff", "Active projects")
    panel(d, img, 820, 130, 420, 160, "#ffffff", "Recent activity")
    # Settings button, centered at (1120, 80) to match manifest cursor target.
    panel(d, img, 1120 - 110, 80 - 28, 220, 56, "#3b6ef0", "Settings  ⚙", text_fill="#fff")
    save(img, s, "0001.png")

    img, d = base_page("#1b1f27", "Settings", "fake capture — scenario 1, frame 2/3")
    # Notifications heading, centered at (640, 220).
    d.text((640 - 110, 220 - 18), "Notifications", font=F_LABEL, fill="#ffd24a")
    panel(d, img, 340, 260, 600, 70, "#2a2f3a", "Email alerts:  ON")
    panel(d, img, 340, 345, 600, 70, "#2a2f3a", "Push alerts:  OFF")
    panel(d, img, 340, 430, 600, 70, "#2a2f3a", "Digest frequency:  Weekly")
    # Save button, centered at (640, 700).
    panel(d, img, 640 - 100, 700 - 28, 200, 56, "#2ecc71", "Save", text_fill="#0a1f12")
    save(img, s, "0002.png")

    img, d = base_page("#1b1f27", "Settings saved", "fake capture — scenario 1, frame 3/3")
    panel(d, img, 440, 320, 400, 140, "#2ecc71", "✓ Saved", text_fill="#0a1f12")
    save(img, s, "0003.png")


# ---------------------------------------------------------------------------
# Scenario 2 — Onboarding wizard
#   navigate -> click "Next" -> circle "Email" field -> click "Continue"
# ---------------------------------------------------------------------------

def scenario_2():
    s = "scenario-2"

    img, d = base_page("#eafaf1", "Welcome — Step 1 of 3", "fake capture — scenario 2, frame 1/3")
    panel(d, img, 240, 160, 800, 420, "#ffffff", "Let's get your workspace set up")
    # Next button, centered at (1120, 740).
    panel(d, img, 1120 - 100, 740 - 28, 200, 56, "#3b6ef0", "Next →", text_fill="#fff")
    save(img, s, "0001.png")

    img, d = base_page("#eafaf1", "Your profile — Step 2 of 3", "fake capture — scenario 2, frame 2/3")
    d.text((640 - 40, 360 - 50), "Email", font=F_LABEL, fill="#ffb74a")
    # Email field, centered at (640, 360).
    panel(d, img, 640 - 220, 360 - 25, 440, 50, "#ffffff", "you@example.com", text_fill="#777")
    panel(d, img, 640 - 220, 440 - 25, 440, 50, "#ffffff", "Full name", text_fill="#777")
    # Continue button, centered at (1120, 740).
    panel(d, img, 1120 - 110, 740 - 28, 220, 56, "#3b6ef0", "Continue →", text_fill="#fff")
    save(img, s, "0002.png")

    img, d = base_page("#eafaf1", "All set! — Step 3 of 3", "fake capture — scenario 2, frame 3/3")
    panel(d, img, 390, 300, 500, 160, "#2ecc71", "🎉 You're ready to go", text_fill="#0a1f12")
    save(img, s, "0003.png")


# ---------------------------------------------------------------------------
# Scenario 3 — Checkout flow
#   navigate -> click "Checkout" -> circle "Promo code" field -> click "Place order"
# ---------------------------------------------------------------------------

def scenario_3():
    s = "scenario-3"

    img, d = base_page("#fff7ec", "Your cart (2 items)", "fake capture — scenario 3, frame 1/3")
    panel(d, img, 240, 140, 800, 90, "#ffffff", "Mechanical keyboard  —  $89.00")
    panel(d, img, 240, 250, 800, 90, "#ffffff", "USB-C hub  —  $34.00")
    # Checkout button, centered at (1120, 740).
    panel(d, img, 1120 - 110, 740 - 28, 220, 56, "#e67e22", "Checkout →", text_fill="#fff")
    save(img, s, "0001.png")

    img, d = base_page("#fff7ec", "Checkout", "fake capture — scenario 3, frame 2/3")
    d.text((640 - 70, 420 - 50), "Promo code", font=F_LABEL, fill="#ffb74a")
    # Promo code field, centered at (640, 420).
    panel(d, img, 640 - 220, 420 - 25, 440, 50, "#ffffff", "Enter code", text_fill="#777")
    panel(d, img, 440, 520, 400, 60, "#ffffff", "Total:  $123.00")
    # Place order button, centered at (640, 740).
    panel(d, img, 640 - 130, 740 - 28, 260, 56, "#e67e22", "Place order", text_fill="#fff")
    save(img, s, "0002.png")

    img, d = base_page("#fff7ec", "Order confirmed", "fake capture — scenario 3, frame 3/3")
    panel(d, img, 390, 300, 500, 160, "#2ecc71", "✓ Order #10482 placed", text_fill="#0a1f12")
    save(img, s, "0003.png")


if __name__ == "__main__":
    scenario_1()
    scenario_2()
    scenario_3()
    print("done")
