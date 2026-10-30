from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

root=Path.cwd()
photo=root/'self_driving_car_reference.png'
png_out=root/'Self_Driving_Car_Mini_Project_Cover.png'
docx_out=root/'Self_Driving_Car_Mini_Project.docx'
regs=['RA2611067010041','RA2611067010083','RA2611067010084','RA2611067010098','RA2611067010040','RA2611067010096']

# Create full-page A4 PNG.
W,H=1240,1754
canvas=Image.new('RGB',(W,H),'white')
d=ImageDraw.Draw(canvas)
fdir=Path(r'C:\Windows\Fonts')
font=lambda file,size: ImageFont.truetype(str(fdir/file),size)
f_title=font('timesbd.ttf',31); f_sub=font('timesbd.ttf',22); f_head=font('timesbd.ttf',20)
f_body=font('times.ttf',19); f_bold=font('timesbd.ttf',19); f_small=font('times.ttf',17); f_italic=font('timesi.ttf',16)
ink='#111111'; margin=70; cw=W-2*margin

def center(text,y,ft):
    b=d.textbbox((0,0),text,font=ft); d.text(((W-(b[2]-b[0]))/2,y),text,font=ft,fill=ink)
def wrap(text,ft,maxw):
    words=text.split(); lines=[]; line=''
    for word in words:
        cand=(line+' '+word).strip()
        if d.textlength(cand,font=ft)<=maxw: line=cand
        else:
            if line: lines.append(line)
            line=word
    if line: lines.append(line)
    return lines

y=48
center('AUTONOMOUS LINE FOLLOWING AND OBSTACLE AVOIDANCE CAR',y,f_title); y+=43
center('Mini Project',y,f_sub); y+=39
center('Group Members',y,f_head); y+=32

# Registration rows: each ID on its own line with programme and section beside it.
cols=[360,510,230]
x0=margin
headers=['Registration Number','Programme / Specialization','Section']
header_h=34; row_h=62
for i,(label,w) in enumerate(zip(headers,cols)):
    x=x0+sum(cols[:i]); d.rectangle((x,y,x+w,y+header_h),outline='#333333',width=2)
    b=d.textbbox((0,0),label,font=f_small); d.text((x+(w-(b[2]-b[0]))/2,y+7),label,font=f_small,fill=ink)
y+=header_h
for reg in regs:
    vals=[reg,'B.Tech EEE - VLSI Design and Technology','M1']
    for i,(val,w) in enumerate(zip(vals,cols)):
        x=x0+sum(cols[:i]); d.rectangle((x,y,x+w,y+row_h),outline='#444444',width=1)
        ft=f_bold if i<3 else f_body
        b=d.textbbox((0,0),val,font=ft); d.text((x+(w-(b[2]-b[0]))/2,y+(row_h-(b[3]-b[1]))/2-2),val,font=ft,fill=ink)
    y+=row_h

y+=24
center('College of Engineering & Technology',y,f_body); y+=28
center('SRM Institute of Science and Technology, Kattankulathur, Chengalpattu District, Tamil Nadu',y,f_small); y+=41
center('Faculty In-Charge',y,f_head); y+=30
center('Radhamani A V',y,f_body); y+=26
center('Department of Physics and Nanotechnology',y,f_small); y+=24
center('College of Engineering & Technology, SRM Institute of Science and Technology',y,f_small); y+=36

summary=('This mini project presents a low-cost autonomous car that follows a marked path and responds to obstacles on its route. '
'An infrared sensor array detects the line and helps the controller correct the car direction. An ultrasonic sensor measures the distance to objects ahead. '
'When it detects an obstacle, the car stops, scans for a clear direction, turns, and searches for the line again. A microcontroller processes sensor readings and controls the two geared motors through a dual motor driver. '
'The project demonstrates embedded programming, sensor interfacing, motor control, and basic autonomous navigation on a controlled indoor course.')
lab='Summary: '
d.text((margin,y),lab,font=f_head,fill=ink); labw=d.textlength(lab,font=f_head)
words=summary.split(); first=''; pos=0
while pos<len(words):
    cand=(first+' '+words[pos]).strip()
    if d.textlength(cand,font=f_body)<=cw-labw: first=cand; pos+=1
    else: break
d.text((margin+labw,y+1),first,font=f_body,fill=ink); y+=25
rest=' '.join(words[pos:])
for line in wrap(rest,f_body,cw): d.text((margin,y),line,font=f_body,fill=ink); y+=24

y+=8
car=Image.open(photo).convert('RGB')
car_w=1020; car_h=round(car.height*car_w/car.width)
car=car.resize((car_w,car_h),Image.Resampling.LANCZOS)
canvas.paste(car,((W-car_w)//2,y)); y+=car_h+10
caption='Figure. Concept image of the autonomous car with line-following and obstacle-detection sensors.'
for line in wrap(caption,f_italic,cw):
    b=d.textbbox((0,0),line,font=f_italic); d.text(((W-(b[2]-b[0]))/2,y),line,font=f_italic,fill=ink); y+=22
canvas.save(png_out,dpi=(150,150),optimize=True)

# Keep the editable Word cover in sync with the PNG.
doc=Document(); sec=doc.sections[0]
sec.page_width=Inches(8.27); sec.page_height=Inches(11.69)
sec.top_margin=Inches(.38); sec.bottom_margin=Inches(.34); sec.left_margin=Inches(.48); sec.right_margin=Inches(.48)
normal=doc.styles['Normal']; normal.font.name='Times New Roman'; normal.font.size=Pt(10)
normal._element.rPr.rFonts.set(qn('w:eastAsia'),'Times New Roman'); normal.paragraph_format.space_after=Pt(0); normal.paragraph_format.line_spacing=1.0

def ptext(text,size=10,bold=False,align=WD_ALIGN_PARAGRAPH.CENTER,before=0,after=0,italic=False):
    p=doc.add_paragraph(); p.alignment=align; p.paragraph_format.space_before=Pt(before); p.paragraph_format.space_after=Pt(after); p.paragraph_format.line_spacing=1.0
    r=p.add_run(text); r.bold=bold; r.italic=italic; r.font.name='Times New Roman'; r.font.size=Pt(size); r._element.rPr.rFonts.set(qn('w:eastAsia'),'Times New Roman')
    return p
ptext('AUTONOMOUS LINE FOLLOWING AND OBSTACLE AVOIDANCE CAR',16,True,before=8,after=1)
ptext('Mini Project',11,True,after=4)
ptext('Group Members',10.5,True,after=3)
t=doc.add_table(rows=1,cols=3); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.autofit=False
widths=[Inches(2.15),Inches(3.55),Inches(1.15)]
for i,(cell,label) in enumerate(zip(t.rows[0].cells,headers)):
    cell.width=widths[i]; cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
    p=cell.paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_after=Pt(0)
    r=p.add_run(label); r.bold=True; r.font.name='Times New Roman'; r.font.size=Pt(9); r._element.rPr.rFonts.set(qn('w:eastAsia'),'Times New Roman')
for reg in regs:
    cells=t.add_row().cells
    vals=[reg,'B.Tech EEE - VLSI Design and Technology','M1']
    for i,(cell,val) in enumerate(zip(cells,vals)):
        cell.width=widths[i]; cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p=cell.paragraphs[0]; p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_after=Pt(0); p.paragraph_format.line_spacing=1.0
        r=p.add_run(val); r.bold=True; r.font.name='Times New Roman'; r.font.size=Pt(9.5); r._element.rPr.rFonts.set(qn('w:eastAsia'),'Times New Roman')
# Set modest cell padding and consistent visible borders.
for row in t.rows:
    trPr=row._tr.get_or_add_trPr(); ht=OxmlElement('w:trHeight'); ht.set(qn('w:val'),'370'); ht.set(qn('w:hRule'),'atLeast'); trPr.append(ht)
for cell in [c for row in t.rows for c in row.cells]:
    tcPr=cell._tc.get_or_add_tcPr(); borders=tcPr.first_child_found_in('w:tcBorders')
    if borders is None: borders=OxmlElement('w:tcBorders'); tcPr.append(borders)
    for edge in ('top','left','bottom','right','insideH','insideV'):
        el=OxmlElement('w:'+edge); el.set(qn('w:val'),'single'); el.set(qn('w:sz'),'5'); el.set(qn('w:color'),'777777'); borders.append(el)
ptext('College of Engineering & Technology',10,False,before=6,after=1)
ptext('SRM Institute of Science and Technology, Kattankulathur, Chengalpattu District, Tamil Nadu',8.8,False,after=5)
ptext('Faculty In-Charge',10.5,True,after=1)
ptext('Radhamani A V',9.8,False,after=1)
ptext('Department of Physics and Nanotechnology',9.2,False,after=0)
ptext('College of Engineering & Technology, SRM Institute of Science and Technology',8.6,False,after=5)
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY; p.paragraph_format.space_after=Pt(3); p.paragraph_format.line_spacing=1.0
r=p.add_run('Summary: '); r.bold=True; r.font.name='Times New Roman'; r.font.size=Pt(9.5)
r=p.add_run(summary); r.font.name='Times New Roman'; r.font.size=Pt(9.5)
p=doc.add_paragraph(); p.alignment=WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_after=Pt(1); p.paragraph_format.space_before=Pt(2); p.add_run().add_picture(str(photo),width=Inches(6.25))
ptext('Figure. Concept image of the autonomous car with line-following and obstacle-detection sensors.',8.3,False,italic=True)
doc.core_properties.title='Autonomous Line Following and Obstacle Avoidance Car'
doc.core_properties.subject='Mini Project Cover Page'
doc.save(docx_out)
print('PNG:',png_out,'DOCX:',docx_out,'PNG content ends at',y,'of',H)

