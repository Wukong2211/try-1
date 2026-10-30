from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

root = Path.cwd()
W,H = 1240,1754
img = Image.new('RGB',(W,H),'white')
draw = ImageDraw.Draw(img)
font_dir = Path(r'C:\Windows\Fonts')
regular = ImageFont.truetype(str(font_dir/'times.ttf'), 20)
bold = ImageFont.truetype(str(font_dir/'timesbd.ttf'), 21)
small = ImageFont.truetype(str(font_dir/'times.ttf'), 18)
small_italic = ImageFont.truetype(str(font_dir/'timesi.ttf'), 17)
subtitle = ImageFont.truetype(str(font_dir/'timesbd.ttf'), 23)
title = ImageFont.truetype(str(font_dir/'timesbd.ttf'), 32)
margin = 115
content_w = W-2*margin

def centered(text, y, font, fill='#111111'):
    box = draw.textbbox((0,0),text,font=font)
    draw.text(((W-(box[2]-box[0]))/2,y),text,font=font,fill=fill)

def wrap(text,font,max_w):
    words=text.split()
    lines=[]; line=''
    for word in words:
        cand=(line+' '+word).strip()
        if draw.textlength(cand,font=font) <= max_w:
            line=cand
        else:
            if line: lines.append(line)
            line=word
    if line: lines.append(line)
    return lines

def center_block(text,y,font,max_w=content_w,spacing=26):
    lines=wrap(text,font,max_w)
    for line in lines:
        centered(line,y,font)
        y += spacing
    return y

y=90
centered('AUTONOMOUS LINE FOLLOWING AND OBSTACLE AVOIDANCE CAR',y,title); y+=47
centered('Mini Project',y,subtitle); y+=42
centered('Group Members',y,bold); y+=31
regs='Registration Numbers: RA2611067010041, RA2611067010083, RA2611067010084, RA2611067010098, RA2611067010040, RA2611067010096'
y=center_block(regs,y,small,content_w,24)+6
centered('Section M1',y,bold); y+=35
centered('B.Tech in Electrical and Electronics Engineering',y,regular); y+=28
centered('VLSI Design and Technology',y,regular); y+=35
centered('College of Engineering & Technology',y,regular); y+=28
y=center_block('SRM Institute of Science and Technology, Kattankulathur, Chengalpattu District, Tamil Nadu',y,small,content_w,23)+6
centered('Faculty In-Charge',y,bold); y+=29
centered('Radhamani A V',y,regular); y+=27
centered('Department of Electrical and Electronics Engineering',y,small); y+=34

summary=('This mini project presents a low-cost autonomous car that follows a marked path and responds to obstacles on its route. '
'An infrared sensor array detects the line and helps the controller correct the car direction. An ultrasonic sensor measures the distance to objects ahead; when an obstacle is detected, the car stops, scans for a clear direction, and turns before searching for the line again. '
'A microcontroller processes the sensor readings and sends control signals through a dual motor driver to the two geared motors. The project brings together embedded C/C++ programming, sensor interfacing, motor control, and basic autonomous navigation. '
'The prototype will be demonstrated on a controlled indoor course using a high-contrast track and safe, stationary obstacles. Its performance can be evaluated by line-tracking accuracy, obstacle response, and whether it can rejoin the route after a detour.')
label='Summary: '
draw.text((margin,y),label,font=bold,fill='#111111')
label_w=draw.textlength(label,font=bold)
lines=wrap(summary,regular,content_w-label_w)
# First line flows after the bold label; remaining lines align with the left text edge.
first=''
words=summary.split(); remaining=[]
for word in words:
    candidate=(first+' '+word).strip()
    if draw.textlength(candidate,font=regular) <= content_w-label_w:
        first=candidate
    else:
        remaining.append(word)
        break
if remaining:
    idx=words.index(remaining[0])
    rest=' '.join(words[idx:])
else: rest=''
draw.text((margin+label_w,y),first,font=regular,fill='#111111'); y+=25
for line in wrap(rest,regular,content_w):
    draw.text((margin,y),line,font=regular,fill='#111111'); y+=25

y+=10
car=Image.open(root/'self_driving_car_reference.png').convert('RGB')
car_w=1000
car_h=round(car.height*car_w/car.width)
car=car.resize((car_w,car_h),Image.Resampling.LANCZOS)
x=(W-car_w)//2
img.paste(car,(x,y)); y+=car_h+13
caption='Figure. Concept image of the autonomous car with line-following and obstacle-detection sensors.'
y=center_block(caption,y,small_italic,content_w,23)

out=root/'Self_Driving_Car_Mini_Project_Cover.png'
img.save(out,dpi=(150,150),optimize=True)
print(out, 'content-bottom', y, 'page-height', H)
