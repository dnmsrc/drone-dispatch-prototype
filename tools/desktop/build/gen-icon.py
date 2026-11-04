# 生成桌面程序图标（多尺寸 .ico）：深蓝底 + 蓝色星球 + 四盏编队灯
from PIL import Image, ImageDraw

S = 256

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(base)

# 圆角深蓝底
r = 58
d.rounded_rectangle([4, 4, S - 4, S - 4], radius=r, fill=(13, 21, 38, 255))
# 底色渐变（自上而下）
for y in range(S):
    t = y / (S - 1)
    col = lerp((22, 36, 63), (10, 17, 32), t)
    d.line([(4, y), (S - 4, y)], fill=col + (255,))
# 重新裁圆角
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([4, 4, S - 4, S - 4], radius=r, fill=255)
base.putalpha(mask)

d = ImageDraw.Draw(base)

# 星球（径向渐变的近似：多层同心圆）
cx, cy, rad = S // 2, S // 2 + 4, 62
for i in range(rad, 0, -1):
    t = i / rad
    col = lerp((160, 220, 255), (32, 78, 168), t)
    d.ellipse([cx - i, cy - i, cx + i, cy + i], fill=col + (255,))

# 高光
d.ellipse([cx - 34, cy - 40, cx - 10, cy - 16], fill=(255, 255, 255, 235))

# 四盏编队灯（环绕）
import math
for k in range(4):
    ang = math.radians(-45 + k * 90)
    lx = cx + int(96 * math.cos(ang))
    ly = cy + int(96 * math.sin(ang))
    d.ellipse([lx - 11, ly - 11, lx + 11, ly + 11], fill=(126, 200, 255, 255))
    d.ellipse([lx - 5, ly - 5, lx + 5, ly + 5], fill=(235, 248, 255, 255))
    # 从星球到灯的细连线
    d.line([(cx + int(rad * 0.95 * math.cos(ang)), cy + int(rad * 0.95 * math.sin(ang))), (lx, ly)],
           fill=(96, 160, 235, 150), width=2)

base.save('icon-256.png')
base.resize((16, 16), Image.LANCZOS).save('i16.png')
base.resize((24, 24), Image.LANCZOS).save('i24.png')
base.resize((32, 32), Image.LANCZOS).save('i32.png')
base.resize((48, 48), Image.LANCZOS).save('i48.png')
base.resize((64, 64), Image.LANCZOS).save('i64.png')
base.resize((128, 128), Image.LANCZOS).save('i128.png')

imgs = [Image.open(f'i{s}.png') if s != 256 else base for s in (16, 24, 32, 48, 64, 128, 256)]
imgs[0].save('icon.ico', format='ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('icon.ico ok')
