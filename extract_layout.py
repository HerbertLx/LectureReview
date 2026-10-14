"""Extract reading regions from PDF line geometry; no model requests."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parent
import pymupdf

def regions(page):
    width,height=page.rect.width,page.rect.height
    lines=[]
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines',[]):
            text=''.join(span['text'] for span in line.get('spans',[])).strip()
            if not text: continue
            x0,y0,x1,y1=line['bbox']
            region='header' if y1<height*.14 else 'full' if x1-x0>width*.68 else 'right' if x0>=width*.48 else 'left'
            lines.append({'text':text,'bbox':[round(x0/width,3),round(y0/height,3),round(x1/width,3),round(y1/height,3)],'region':region})
    left=[line for line in lines if line['region']=='left']
    right=[line for line in lines if line['region']=='right']
    columns=len(left)>=2 and len(right)>=2
    grouped={region:[] for region in ('header','left','right','full')}
    for line in sorted(lines,key=lambda line:(round(line['bbox'][1],2),line['bbox'][0])):
        group=line['region'] if columns else 'header' if line['region']=='header' else 'full'
        grouped[group].append(line['text'])
    return {'mode':'columns' if columns else 'single','regions':{region:'\n'.join(text) for region,text in grouped.items()},'lines':lines}

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description='Extract PDF text regions without model calls')
    parser.add_argument('pdf',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    doc=pymupdf.open(args.pdf)
    layout={str(n+1):regions(page) for n,page in enumerate(doc)}
    path=args.output
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(layout,ensure_ascii=False,indent=2),encoding='utf-8')
    print('LAYOUT_PAGES:',len(layout))
