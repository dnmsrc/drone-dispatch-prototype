# 像素级定位：卡片白底边界 vs 按钮（实心紫 / 描边紫）边界，判断按钮是否贴边/溢出卡片内边距
import sys
from PIL import Image

def scan(path):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    px = im.load()
    print(f'\n=== {path}  {W}x{H} ===')
    # 页面背景是 #F6F7FB (246,247,251)，卡片是纯白 (255,255,255)
    def is_white(p):
        return p[0] > 250 and p[1] > 250 and p[2] > 250
    def is_page(p):  # 页面底色
        return abs(p[0]-246) <= 3 and abs(p[1]-247) <= 3 and abs(p[2]-251) <= 3
    def is_primary(p):  # 实心主按钮渐变 #4A6CF7..#6C8BFF
        r, g, b = p
        return b > 200 and b - r > 60 and b - g > 20 and r < 150
    def is_primary_line(p):  # 描边按钮边线
        r, g, b = p
        return b > 180 and b - r > 40 and r < 160
    # 每行：卡片白色水平范围
    rows = []
    for y in range(0, H, 2):
        xs = [x for x in range(0, W, 1) if is_white(px[x, y])]
        if not xs: continue
        rows.append((y, min(xs), max(xs)))
    # 卡片块：连续同边界的行聚合
    blocks = []
    for y, l, r in rows:
        if blocks and y - blocks[-1][1] <= 4 and abs(blocks[-1][2] - l) <= 2 and abs(blocks[-1][3] - r) <= 2:
            blocks[-1][1] = y; blocks[-1][3] = max(blocks[-1][3], r)
        else:
            blocks.append([y, y, l, r])
    print('白色卡片块 (y起,y止,x左,x右):')
    for b in blocks:
        if b[1] - b[0] > 20:
            print('  ', b)
    # 按钮：找主色像素的横向范围，按 y 带聚类
    bands = []
    for y in range(0, H):
        xs = [x for x in range(0, W) if is_primary(px[x, y])]
        if len(xs) < 8: continue
        if bands and y - bands[-1][1] <= 2:
            bands[-1][1] = y; bands[-1][2] = min(bands[-1][2], min(xs)); bands[-1][3] = max(bands[-1][3], max(xs))
        else:
            bands.append([y, y, min(xs), max(xs)])
    print('实心主色按钮带 (y起,y止,x左,x右):')
    for b in bands:
        if b[1] - b[0] > 20:
            print('  ', b)
    # 描边按钮（圆角边框，取半透明蓝线）：检测每行行尾附近的浅蓝描边
    print('按行看卡片右缘与内容右缘（取卡片最后 8px）:')
    for b in blocks:
        if b[1] - b[0] > 60:
            y = b[1] - 6
            row = [x for x in range(W) if not is_white(px[x, y]) and not is_page(px[x, y])]
            print(f'  card y{b[0]}-{b[1]} x{b[2]}-{b[3]} 底行非白像素={row[:12]}')

for p in sys.argv[1:]:
    scan(p)
