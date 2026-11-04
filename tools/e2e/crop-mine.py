# 裁剪放大：看看用户截图里到底哪里不对（按钮行、标题行、说明条）
from PIL import Image
import sys

src = sys.argv[1]
im = Image.open(src).convert('RGB')
W, H = im.size
crops = {
    'crop-head1.png': (0, 70, W, 200),    # 卡片1 标题行 + 副标题
    'crop-acts1.png': (0, 270, W, 360),   # 卡片1 按钮行
    'crop-head2.png': (0, 360, W, 440),   # 卡片2 标题行
    'crop-acts2.png': (0, 690, W, 760),   # 卡片2 说明条 + 按钮行
}
for name, box in crops.items():
    c = im.crop(box)
    c = c.resize((c.width * 3, c.height * 3), Image.LANCZOS)
    c.save('shots/' + name)
    print(name, c.size)
