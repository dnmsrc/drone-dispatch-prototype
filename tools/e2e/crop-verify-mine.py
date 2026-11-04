# 像素级对比两张卡片的同名元素位置（胶囊 / 按钮 / 键值行），找对齐与内边距偏差
from PIL import Image
import sys

def bbox_of(px, W, H, pred, y0, y1, x0=0, x1=None):
    x1 = W if x1 is None else x1
    xs, ys = [], []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if pred(px[x, y]):
                xs.append(x); ys.append(y)
    if not xs: return None
    return (min(xs), min(ys), max(xs), max(ys))

path = sys.argv[1]
im = Image.open(path).convert('RGB')
W, H = im.size
px = im.load()
print(f'{path} {W}x{H}')

# 卡片白底：找每个 y 行的白色范围，聚合出卡片 y 区间
white_rows = []
for y in range(H):
    xs = [x for x in range(W) if px[x, y][0] > 252 and px[x, y][1] > 252 and px[x, y][2] > 252]
    if len(xs) > W * 0.5: white_rows.append((y, min(xs), max(xs)))
blocks = []
for y, l, r in white_rows:
    if blocks and y - blocks[-1][1] <= 3 and abs(blocks[-1][2] - l) <= 1:
        blocks[-1][1] = y; blocks[-1][2] = min(blocks[-1][2], l); blocks[-1][3] = max(blocks[-1][3], r)
    else: blocks.append([y, y, l, r])
cards = [b for b in blocks if b[1] - b[0] > 100]
print('卡片白底块:', cards)

# 真实卡片 box：白底块受圆角影响，左右各扩 = 圆角半径（24rpx = 24*W/750 px）
rad = 24 * W / 750
for i, b in enumerate(cards):
    y0, y1, xl, xr = b
    print(f'卡{i+1}: 白底 y{y0}-{y1} x{xl}-{xr} · 推算真实 box x{round(xl-rad)}-{round(xr+rad)} y{round(y0-rad)}-{round(y1+rad)}')

def is_blue_chip(p):   # 淡蓝胶囊底 rgba(74,108,247,.1) 叠在白底
    r, g, bb = p
    return 225 <= r <= 245 and 232 <= g <= 248 and bb >= 248
def is_gray_chip(p):   # --bg-2 #F2F3F9
    r, g, bb = p
    return 236 <= r <= 248 and 237 <= g <= 249 and 244 <= bb <= 255
def is_primary(p):
    r, g, bb = p
    return bb > 200 and bb - r > 60 and bb - g > 20 and r < 150
def is_primary_soft(p):  # 描边按钮的淡蓝底 rgba(74,108,247,.06)
    r, g, bb = p
    return 240 <= r <= 252 and 242 <= g <= 252 and bb >= 250 and bb - r > 5

for i, b in enumerate(cards):
    y0, y1, xl, xr = b
    box_l, box_r = xl - rad, xr + rad
    chip = bbox_of(px, W, H, is_blue_chip, y0, min(y1, y0 + 120), int(xl), int(xr))
    chip2 = bbox_of(px, W, H, is_gray_chip, y0, min(y1, y0 + 120), int(xl + 200), int(xr))
    solid = bbox_of(px, W, H, is_primary, max(y0, y1 - 120), y1)
    soft = bbox_of(px, W, H, is_primary_soft, max(y0, y1 - 120), y1)
    print(f'\n卡{i+1}:')
    print(f'  淡蓝胶囊 bbox={chip}  灰胶囊 bbox={chip2}')
    print(f'  实心按钮 bbox={solid}  描边按钮(淡蓝底) bbox={soft}')
    for name, bb in [('淡蓝胶囊', chip), ('灰胶囊', chip2), ('实心按钮', solid), ('描边按钮', soft)]:
        if not bb: continue
        l, t, r_, bo = bb
        print(f'    {name}: 距左内边距 {round(l - box_l)}px / {round((l-box_l)*750/W)}rpx · 距右内边距 {round(box_r - r_)}px / {round((box_r-r_)*750/W)}rpx · 高 {round(bo-t + 1)}px / {round((bo-t+1)*750/W)}rpx')
