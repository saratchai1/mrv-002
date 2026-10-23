import zipfile, xml.etree.ElementTree as ET, json, pathlib, collections, re, hashlib, sys

PROJECT = pathlib.Path(__file__).resolve().parents[2]
SRC = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else PROJECT / 'public' / 'source-baseline.xlsx'
OUT = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else PROJECT / 'outputs' / 'baseline-extraction'
OUT.mkdir(parents=True, exist_ok=True)
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'

def col_index(col):
    out=0
    for ch in col:out=out*26+ord(ch)-64
    return out
def col_letters(index):
    out=''
    while index: index,rem=divmod(index-1,26);out=chr(65+rem)+out
    return out
def translate_formula(formula,origin,target):
    oc,orr=re.match(r'([A-Z]+)(\d+)',origin).groups();tc,tr=re.match(r'([A-Z]+)(\d+)',target).groups()
    dc,dr=col_index(tc)-col_index(oc),int(tr)-int(orr)
    def sub(m):
        ca,c,ra,r=m.groups()
        return ca+(c if ca else col_letters(col_index(c)+dc))+ra+str(int(r)+(0 if ra else dr))
    return re.sub(r'(?<![A-Za-z0-9_])([$]?)([A-Z]{1,3})([$]?)(\d+)',sub,formula)

def load_workbook():
    z = zipfile.ZipFile(SRC)
    sst = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS):
            sst.append(''.join(x.text or '' for x in si.iter('{'+NS['s']+'}t')))
    rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    sheets = []
    for sheet in wb.find('s:sheets',NS):
        name = sheet.attrib['name']
        target = rels[sheet.attrib[REL]]
        path = target.lstrip('/') if target.startswith('/') else 'xl/'+target
        root = ET.fromstring(z.read(path))
        cells = {}
        for c in root.findall('.//s:sheetData/s:row/s:c',NS):
            typ = c.attrib.get('t','n'); f=c.find('s:f',NS); v=c.find('s:v',NS)
            value = v.text if v is not None else None
            if typ == 's' and value is not None: value=sst[int(value)]
            elif typ == 'inlineStr': value=''.join(t.text or '' for t in c.findall('.//s:t',NS))
            elif typ == 'n' and value is not None:
                try:
                    value=float(value); value=int(value) if value.is_integer() else value
                except ValueError: pass
            elif typ == 'b' and value is not None: value = value=='1'
            if value is None and f is None: continue
            cells[c.attrib['r']]={'v':value, **({'f':f.text,'fattrs':f.attrib} if f is not None else {}), 't':typ}
        masters={c['fattrs']['si']:(ref,c['f']) for ref,c in cells.items() if c.get('fattrs',{}).get('t')=='shared' and c.get('f')}
        for ref,c in cells.items():
            if c.get('fattrs',{}).get('t')=='shared' and not c.get('f'):
                origin,formula=masters[c['fattrs']['si']]
                c['f']=translate_formula(formula,origin,ref)
        sheets.append({'name':name,'id':sheet.attrib['sheetId'],'path':path,'dimension':root.find('s:dimension',NS).attrib.get('ref') if root.find('s:dimension',NS) is not None else None,'cells':cells,'merges':[m.attrib['ref'] for m in root.findall('s:mergeCells/s:mergeCell',NS)]})
    return sheets

if __name__=='__main__':
    sheets=load_workbook()
    OUT.mkdir(exist_ok=True)
    (OUT/'raw-workbook.json').write_text(json.dumps(sheets,ensure_ascii=False,separators=(',',':')))
    inventory=[]
    for s in sheets:
        rows=collections.defaultdict(list)
        for ref,c in s['cells'].items():
            r=int(re.sub('[^0-9]','',ref))
            rows[r].append(f'{ref}={c["v"]!s}'+(f' [={c["f"]}]' if c.get('f') else ''))
        sample=[' | '.join(v) for r,v in sorted(rows.items()) if r<=10]
        inventory.append({'name':s['name'],'dimension':s['dimension'],'cells':len(s['cells']),'formulas':sum('f' in c for c in s['cells'].values()),'sample':sample})
    (OUT/'inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2))
    print(json.dumps(inventory,ensure_ascii=False,indent=2))
