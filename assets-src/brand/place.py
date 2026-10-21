"""Resize the rendered brand art into every icon and splash slot of the iOS and Android projects."""
import os, sys
from PIL import Image, ImageDraw

out, root = sys.argv[1], sys.argv[2]
res = os.path.join(root, 'android/app/src/main/res')
icon = Image.open(os.path.join(out, 'icon.png')).convert('RGB')
icon.save(os.path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'))
fg = Image.open(os.path.join(out, 'fg.png')).convert('RGBA')
for d, s in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    small = icon.resize((s, s), Image.LANCZOS)
    small.save(os.path.join(res, f'mipmap-{d}', 'ic_launcher.png'))
    mask = Image.new('L', (s * 4, s * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, s * 4 - 1, s * 4 - 1), fill=255)
    rnd = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    rnd.paste(small, (0, 0), mask.resize((s, s), Image.LANCZOS))
    rnd.save(os.path.join(res, f'mipmap-{d}', 'ic_launcher_round.png'))
    fg.resize((s * 9 // 4, s * 9 // 4), Image.LANCZOS).save(os.path.join(res, f'mipmap-{d}', 'ic_launcher_foreground.png'))

def fill(src, w, h):
    """Scale to cover w x h, then crop the middle."""
    k = max(w / src.width, h / src.height)
    r = src.resize((round(src.width * k), round(src.height * k)), Image.LANCZOS)
    x, y = (r.width - w) // 2, (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))

square = Image.open(os.path.join(out, 'splash-square.png')).convert('RGB')
for f in ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']:
    square.save(os.path.join(root, 'ios/App/App/Assets.xcassets/Splash.imageset', f))
land = Image.open(os.path.join(out, 'splash-land.png')).convert('RGB')
port = Image.open(os.path.join(out, 'splash-port.png')).convert('RGB')
for d in os.listdir(res):
    p = os.path.join(res, d, 'splash.png')
    if not os.path.exists(p):
        continue
    w, h = Image.open(p).size
    fill(land if w >= h else port, w, h).save(p)
# The web build's home-screen icons (installed to a phone's home screen from the browser)
web = os.path.join(root, 'public/icons')
os.makedirs(web, exist_ok=True)
for name, s in [('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)]:
    icon.resize((s, s), Image.LANCZOS).save(os.path.join(web, name), optimize=True)
print('icons and splash screens updated')
