from docx import Document
from pathlib import Path
p = Path(r'C:\Users\ASUS\OneDrive\Documents\ChatGPT\remote control car\Self_Driving_Car_Mini_Project.docx')
doc = Document(p)
target = next(x for x in doc.paragraphs if x.text.startswith('Registration Numbers:'))
text = target.text + ', RA2611067010096'
first = target.runs[0]
for run in target.runs[1:]:
    run.text = ''
first.text = text
doc.save(p)
print(target.text)
