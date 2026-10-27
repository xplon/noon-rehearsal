"""Lay out final/archived renders at the same normalized standing height."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parent
old=Image.open(R/'archive/three-quarter-v2.png').convert('RGB');new=Image.open(R/'previews/three-quarter.png').convert('RGB')
# Both cameras use ortho_scale = standing_height * (2.95 / 2.238505).
canvas=Image.new('RGB',(1440,1010),'#e9dbbd');canvas.paste(old,(0,110));canvas.paste(new,(720,110))
d=ImageDraw.Draw(canvas)
font='/System/Library/Fonts/Supplemental/Arial.ttf'
f=ImageFont.truetype(font,27);small=ImageFont.truetype(font,18)
d.text((34,20),'BEFORE  /  2.1 heads',font=f,fill='#28344a');d.text((754,20),'AFTER  /  4.5 heads',font=f,fill='#28344a')
d.text((34,65),'Same standing height for proportion comparison',font=small,fill='#705c47');d.text((754,65),'The game renders the new actor 10% smaller',font=small,fill='#705c47')
d.line((720,0,720,1010),fill='#ad9673',width=2);canvas.save(R/'previews/proportions-v2-v3.png')
