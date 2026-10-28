"""Contact sheet of the final v5 pivot clips. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parent/'previews'
items=[('pivot-right-contact.png','RIGHT / DOUBLE SUPPORT','0.000 s'),('pivot-right-first.png','RIGHT / OUTSIDE FOOT','0.233 s'),('pivot-right-transfer.png','RIGHT / WEIGHT TRANSFER','0.467 s'),('pivot-right-second.png','RIGHT / INSIDE FOOT','0.700 s'),('pivot-left-first.png','LEFT / MIRRORED PICKUP','0.233 s')]
w,h=360,450
sheet=Image.new('RGB',(w*5,560),'#ede4d2');d=ImageDraw.Draw(sheet)
font='/System/Library/Fonts/Supplemental/Arial.ttf';f=ImageFont.truetype(font,16);small=ImageFont.truetype(font,14)
d.text((18,14),'NOON TRAVELER v5  |  Pivot footwork  |  External heading + world-space gaze',font=f,fill='#28344a')
for i,(file,label,time) in enumerate(items):
 im=Image.open(root/file).convert('RGB').resize((w,h),Image.Resampling.LANCZOS);sheet.paste(im,(i*w,52))
 d.text((i*w+13,513),label,font=f,fill='#28344a');d.text((i*w+13,536),time+'  /  root held fixed',font=small,fill='#6c5b47')
sheet.save(root/'pivot-v5-contact-sheet.png')
